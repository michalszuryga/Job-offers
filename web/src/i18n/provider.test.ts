import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { I18nProvider, useI18n } from './index'

function Probe() {
  const { lang, t } = useI18n()
  return createElement('p', null, `${lang}: ${t.status.APPLIED}`)
}

describe('I18nProvider', () => {
  test('gives components the messages for its language', () => {
    const render = (lang: 'en' | 'pl') => renderToString(createElement(I18nProvider, { lang }, createElement(Probe)))
    expect(render('en')).toBe('<p>en: Applied</p>')
    expect(render('pl')).toBe('<p>pl: Wysłano</p>')
  })

  test('useI18n outside the provider is a bug, not a silent English fallback', () => {
    expect(() => renderToString(createElement(Probe))).toThrow(/I18nProvider/)
  })
})
