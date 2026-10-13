import { Link } from 'wouter'
import { Logo, Select } from '../../components/ui'
import { LANG_NAMES, LANGS, useI18n, type Lang } from '../../i18n'
import { setThemePref, THEME_PREFS, useThemePref, type ThemePref } from '../../lib/theme'
import { CONTACT_EMAIL, CONTROLLER_NAME } from '../auth/contact'

export const GITHUB_URL = 'https://github.com/michalszuryga/Job-offers'

// §4.2: © JOffers · the controller · Privacy · GitHub · Contact, then language and theme, the
// signed-out visitor's only way to set them (members have the account menu).
export function Footer() {
  const { t, lang, setLang } = useI18n()
  const theme = useThemePref()
  const copy = t.landing.footer
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__about">
          <Logo size={24} />
          <p className="landing-footer__owner">
            {copy.copyright}
            {CONTROLLER_NAME && ` · ${CONTROLLER_NAME}`}
          </p>
          <nav aria-label={copy.label}>
            <ul className="landing-footer__links">
              <li>
                <Link href="/privacy">{copy.privacy}</Link>
              </li>
              <li>
                <a href={GITHUB_URL}>GitHub</a>
              </li>
              {CONTACT_EMAIL && (
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`}>{copy.contact}</a>
                </li>
              )}
            </ul>
          </nav>
        </div>
        <div className="landing-footer__prefs">
          <Select
            label={t.shell.language}
            value={lang}
            onChange={(event) => setLang(event.target.value as Lang)}
            options={LANGS.map((code) => ({ value: code, label: LANG_NAMES[code] }))}
          />
          <Select
            label={t.theme.label}
            value={theme}
            onChange={(event) => setThemePref(event.target.value as ThemePref)}
            options={THEME_PREFS.map((pref) => ({ value: pref, label: t.theme.options[pref] }))}
          />
        </div>
      </div>
    </footer>
  )
}
