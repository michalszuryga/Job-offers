import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { mockSupabase } from './supabase-mock'

// Brand assets and head meta (plan §2.1, P2). None of it depends on the viewport,
// so it runs once, in the desktop project.
const WEB = join(import.meta.dirname, '..')

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport-independent; covered by desktop')
  await mockSupabase(page)
})

// "WxH" and whether there is an alpha channel at all, from the IHDR chunk, which
// always directly follows the 8-byte PNG signature.
function png(file: Buffer) {
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG')
  expect(file.subarray(12, 16).toString('latin1')).toBe('IHDR')
  // Colour type 2 is plain RGB.
  return { size: `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`, opaque: file[25] === 2 }
}

// The app's identity (Manifest spec): an id resolves against start_url's origin, not
// the manifest URL, so "./" would claim the whole github.io site. Without an id it is
// start_url itself.
function manifestId(manifest: { id?: string, start_url: string }, manifestUrl: URL) {
  const start = new URL(manifest.start_url, manifestUrl)
  return manifest.id === undefined ? start.href : new URL(manifest.id, start.origin).href
}

// Both values of a light-dark(#light,#dark) colour token.
function token(name: string) {
  const css = readFileSync(join(WEB, 'src/styles/tokens.css'), 'utf8')
  const pair = css.match(new RegExp(`--${name}:light-dark\\((#\\w+),(#\\w+)\\)`))
  if (!pair) throw new Error(`--${name} is not a light-dark() pair in tokens.css`)
  return { light: pair[1], dark: pair[2] }
}

test('the manifest is served and every icon has its declared size', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const url = new URL(href!, page.url())
  const response = await request.get(url.href)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/manifest+json')

  const manifest = await response.json()
  expect(manifest).toMatchObject({ name: 'JOffers', start_url: './', scope: './', display: 'standalone' })
  // Resolved against the manifest, './' is the app's base path, wherever it is hosted.
  const base = new URL('./', page.url()).href
  expect(new URL(manifest.start_url, url).href).toBe(base)
  // The identity is permanent once installed, so it must not be the origin root.
  expect(manifestId(manifest, url)).toBe(base)

  const icons: ManifestIcon[] = manifest.icons
  expect(icons.map((icon) => icon.purpose ?? 'any')).toEqual(expect.arrayContaining(['any', 'maskable']))
  for (const icon of icons) {
    const file = await request.get(new URL(icon.src, url).href)
    expect(file.status(), icon.src).toBe(200)
    expect(file.headers()['content-type'], icon.src).toContain(icon.type)
    if (icon.type === 'image/png') expect(png(await file.body()).size, icon.src).toBe(icon.sizes)
  }
})

test('Chrome finds the app installable', async ({ baseURL }) => {
  // The default browser hides the verdict twice over: the headless shell reports no
  // errors even without a manifest, and every Playwright context is off the record
  // ("in-incognito"). Full Chromium with a throwaway on-disk profile reports the truth.
  const profile = mkdtempSync(join(tmpdir(), 'joffers-install-'))
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', baseURL })
  try {
    const page = context.pages()[0] ?? await context.newPage()
    await mockSupabase(page)
    await page.goto('./')
    const cdp = await context.newCDPSession(page)
    const { errors } = await cdp.send('Page.getAppManifest')
    expect(errors).toEqual([])
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    expect(installabilityErrors).toEqual([])
    // Chrome's own reading of the identity an install keeps (see manifestId).
    const { appId } = await cdp.send('Page.getAppId')
    expect(appId).toBe(new URL('./', page.url()).href)
  } finally {
    await context.close()
    rmSync(profile, { recursive: true, force: true })
  }
})

test('the favicons are the JOffers mark and no Vite asset is linked', async ({ page, request }) => {
  await page.goto('./')
  const links = await page.locator('link[rel="icon"]').evaluateAll((elements) => elements.map((element) => ({
    href: element.getAttribute('href')!,
    type: element.getAttribute('type'),
    sizes: element.getAttribute('sizes'),
  })))
  // The SVG for current browsers and a PNG for Safari before 26.
  expect(links.map((link) => link.type)).toEqual(['image/png', 'image/svg+xml'])
  for (const { href, type, sizes } of links) {
    const favicon = await request.get(new URL(href, page.url()).href)
    expect(favicon.status(), href).toBe(200)
    expect(favicon.headers()['content-type'], href).toContain(type)
    if (type === 'image/png') {
      expect(png(await favicon.body()).size, href).toBe(sizes)
      continue
    }
    const svg = await favicon.text()
    expect(svg).toContain('#4B3BE8')
    // npm run brand copies it from the source of truth.
    expect(svg).toBe(readFileSync(join(WEB, 'brand/mark.svg'), 'utf8'))
  }

  const urls = await page.locator('link[href], script[src], img[src]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('href') ?? element.getAttribute('src') ?? ''))
  expect(urls.filter((url) => /vite\.svg|react\.svg/i.test(url))).toEqual([])
  expect(await page.locator('head').innerHTML()).not.toMatch(/vite\.svg|react\.svg|#863bff/i)
})

test('the home-screen icon for iOS is served at 180×180 with no transparency', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  const icon = await request.get(new URL(href!, page.url()).href)
  expect(icon.status()).toBe(200)
  // iOS 17.5 uses only this icon for Add to Home Screen and shows transparency as black.
  expect(png(await icon.body())).toEqual({ size: '180x180', opaque: true })
})

test('link previews use absolute https URLs and the image ships with the build', async ({ page, request }) => {
  const response = await page.goto('./')
  // Crawlers read the served HTML as is, so the build must have filled the token in.
  expect(await response!.text()).not.toContain('%SITE_URL%')

  const meta = (selector: string) => page.locator(`meta[${selector}]`).getAttribute('content')
  const image = new URL((await meta('property="og:image"'))!)
  expect(image.protocol).toBe('https:')
  expect(image.pathname).toMatch(/\/og\.png$/)
  expect(await meta('property="og:url"')).toBe(new URL('./', image).href)
  expect([await meta('property="og:image:width"'), await meta('property="og:image:height"')]).toEqual(['1200', '630'])
  expect(await meta('property="og:image:alt"')).toBeTruthy()
  expect(await meta('name="twitter:card"')).toBe('summary_large_image')

  const og = await request.get(new URL(image.pathname, page.url()).href)
  expect(og.status()).toBe(200)
  expect(png(await og.body()).size).toBe('1200x630')
})

test('theme colours match the app bar surface, also when a theme is forced', async ({ page, request }) => {
  const surface = token('surface')
  const canvas = token('canvas')
  const themeColors = () => page.locator('meta[name="theme-color"]').evaluateAll((elements) =>
    elements.map((element) => [element.getAttribute('media'), element.getAttribute('content')]))
  const LIGHT = '(prefers-color-scheme: light)'
  const DARK = '(prefers-color-scheme: dark)'

  await page.goto('./')
  expect(await themeColors()).toEqual([[LIGHT, surface.light], [DARK, surface.dark]])
  const manifest = await (await request.get(new URL('manifest.webmanifest', page.url()).href)).json()
  expect(manifest).toMatchObject({ theme_color: surface.light, background_color: canvas.light })

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => localStorage.setItem('joffers-theme', value), theme)
    await page.reload()
    expect(await themeColors()).toEqual([[LIGHT, surface[theme]], [DARK, surface[theme]]])
  }
})
