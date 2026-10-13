import { describe, expect, test } from 'vitest'
import indexHtml from '../../index.html?raw'
import tokensCss from '../styles/tokens.css?raw'
import { colorSchemeFor, parseThemePref, THEME_KEY, THEME_PREFS, themeColorFor, toHex } from './theme'

const COLORS = { light: '#FFFDF9', dark: '#1D1914' }
const LIGHT = '(prefers-color-scheme: light)'
const DARK = '(prefers-color-scheme: dark)'

describe('parseThemePref', () => {
  test('only light and dark force a theme', () => {
    expect(parseThemePref('light')).toBe('light')
    expect(parseThemePref('dark')).toBe('dark')
    for (const value of [null, undefined, '', 'auto', 'Dark', 'system', 42]) expect(parseThemePref(value), String(value)).toBe('auto')
  })

  test('offers Auto, Light and Dark, in that order', () => {
    expect(THEME_PREFS).toEqual(['auto', 'light', 'dark'])
  })
})

describe('head values', () => {
  test('color-scheme is index.html\'s "light dark" on auto, else the forced scheme', () => {
    expect(colorSchemeFor('auto')).toBe('light dark')
    expect(colorSchemeFor('light')).toBe('light')
    expect(colorSchemeFor('dark')).toBe('dark')
  })

  test('on auto each theme-color meta keeps its own scheme', () => {
    expect(themeColorFor('auto', LIGHT, COLORS)).toBe(COLORS.light)
    expect(themeColorFor('auto', DARK, COLORS)).toBe(COLORS.dark)
    expect(themeColorFor('auto', null, COLORS)).toBe(COLORS.light)
  })

  test('a forced theme gives both metas its colour', () => {
    for (const media of [LIGHT, DARK, null]) {
      expect(themeColorFor('dark', media, COLORS)).toBe(COLORS.dark)
      expect(themeColorFor('light', media, COLORS)).toBe(COLORS.light)
    }
  })
})

describe('toHex', () => {
  test('writes computed colours the way tokens.css and the head script spell them', () => {
    expect(toHex('rgb(255, 253, 249)')).toBe('#FFFDF9')
    expect(toHex('rgb(29, 25, 20)')).toBe('#1D1914')
    expect(toHex('rgb(0, 0, 0)')).toBe('#000000')
  })

  test('leaves anything else as it came', () => {
    for (const value of ['rgba(0, 0, 0, 0.5)', 'color(srgb 1 1 1)', '', 'transparent']) expect(toHex(value)).toBe(value)
  })
})

// theme.ts resolves the colours from tokens.css at run time; the head script carries its own
// copy (it runs before any CSS). Both must stay the app bar's --surface.
describe('the index.html head script agrees', () => {
  const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

  test('same storage key and forced values', () => {
    expect(script).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(script).toMatch(/theme === 'light' \|\| theme === 'dark'/)
  })

  test('its theme colours are --surface in each scheme', () => {
    const surface = tokensCss.match(/--surface:light-dark\((#\w+),(#\w+)\)/)
    const map = script.match(/themeColors = \{ light: '(#\w+)', dark: '(#\w+)' \}/)
    expect(surface, '--surface in tokens.css').not.toBeNull()
    expect(map, 'themeColors in the head script').not.toBeNull()
    expect({ light: map![1], dark: map![2] }).toEqual({ light: surface![1], dark: surface![2] })
  })
})
