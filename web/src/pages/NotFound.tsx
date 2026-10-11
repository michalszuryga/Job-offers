import { Button, Logo } from '../components/ui'
import { useI18n } from '../i18n'
import './NotFound.css'

// Any path the router doesn't know (§4.1). GitHub Pages serves it from 404.html with status
// 404, so this only has to say so and lead back to the app.
export function NotFound() {
  const { t } = useI18n()
  return (
    <main className="not-found">
      <Logo />
      <h1>{t.notFound.title}</h1>
      <p className="muted">{t.notFound.body}</p>
      <Button href={import.meta.env.BASE_URL}>{t.notFound.home}</Button>
    </main>
  )
}
