import { Keyboard, LogOut, Monitor, Moon, ShieldCheck, Sun, User, type LucideIcon } from 'lucide-react'
import { useLocation } from 'wouter'
import { Icon, Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator } from '../ui'
import { LANG_NAMES, LANGS, useI18n } from '../../i18n'
import { setShortcutsHelp } from '../../lib/shortcuts'
import { setThemePref, THEME_PREFS, useThemePref, type ThemePref } from '../../lib/theme'
import { useMediaQuery } from '../../lib/useMediaQuery'

const THEME_ICONS: Record<ThemePref, LucideIcon> = { auto: Monitor, light: Sun, dark: Moon }

interface Props {
  email: string
  onSignOut: () => void
}

// §4.4: the signed-in email, theme, language, Privacy and Sign out. The Menu is a popover where
// the browser has one and a toggled panel otherwise. "Keyboard shortcuts" (P9) only from
// 1024 px, where the offers page answers to them and shows the dialog.
export function AccountMenu({ email, onSignOut }: Props) {
  const { t, lang, setLang } = useI18n()
  const theme = useThemePref()
  const [, navigate] = useLocation()
  const wide = useMediaQuery('(min-width: 1024px)')
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
      {wide && (
        <MenuItem icon={Keyboard} onSelect={() => setShortcutsHelp(true)}>
          {t.shell.shortcuts}
        </MenuItem>
      )}
      <MenuItem icon={ShieldCheck} onSelect={() => navigate('/privacy')}>
        {t.shell.privacy}
      </MenuItem>
      <MenuItem icon={LogOut} onSelect={onSignOut}>
        {t.shell.signOut}
      </MenuItem>
    </Menu>
  )
}
