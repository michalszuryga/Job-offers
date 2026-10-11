import { LogOut, Monitor, Moon, Sun, User, type LucideIcon } from 'lucide-react'
import { Icon, Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator } from '../ui'
import { LANGS, useI18n, type Lang } from '../../i18n'
import { setThemePref, THEME_PREFS, useThemePref, type ThemePref } from '../../lib/theme'

// Each language in its own name, as language pickers show them; not translated.
const LANG_NAMES: Record<Lang, string> = { en: 'English', pl: 'Polski' }
const THEME_ICONS: Record<ThemePref, LucideIcon> = { auto: Monitor, light: Sun, dark: Moon }

interface Props {
  email: string
  onSignOut: () => void
}

// §4.4: the signed-in email, theme, language and Sign out. The Menu is a popover where the
// browser has one and a toggled panel otherwise. "Keyboard shortcuts" arrives in P9 and the
// Privacy link in P8.
export function AccountMenu({ email, onSignOut }: Props) {
  const { t, lang, setLang } = useI18n()
  const theme = useThemePref()
  // By code point, so an address starting with a non-BMP character isn't split in half.
  const initial = [...email.trim()][0]?.toLocaleUpperCase()

  return (
    <Menu
      header={
        <>
          {t.shell.signedInAs} <strong className="account-menu__email">{email}</strong>
        </>
      }
      trigger={(props) => (
        <button {...props} type="button" className="app-bar__avatar" aria-label={t.shell.account}>
          {initial ? <span aria-hidden="true">{initial}</span> : <Icon icon={User} size={20} />}
        </button>
      )}
    >
      <MenuGroup label={t.theme.label}>
        {THEME_PREFS.map((pref) => (
          <MenuRadioItem key={pref} icon={THEME_ICONS[pref]} checked={theme === pref} onSelect={() => setThemePref(pref)}>
            {t.theme.options[pref]}
          </MenuRadioItem>
        ))}
      </MenuGroup>
      <MenuGroup label={t.shell.language}>
        {LANGS.map((code) => (
          <MenuRadioItem key={code} checked={lang === code} onSelect={() => setLang(code)}>
            <span lang={code}>{LANG_NAMES[code]}</span>
          </MenuRadioItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem icon={LogOut} onSelect={onSignOut}>
        {t.shell.signOut}
      </MenuItem>
    </Menu>
  )
}
