import { AppShell } from '../../components/shell/AppShell'
import { DataSourceContext } from '../../lib/dataSource'
import { OffersPage } from '../offers/OffersPage'
import { demoSource } from './demoSource'

// /demo (§4.11): the members' screens on sample data. The same offers page and details as
// the app, in the app shell with a demo banner and a Sign in link in place of the account
// menu. No supabase-js anywhere in this chunk's graph (check-bundle asserts it).
export function Demo() {
  return (
    <DataSourceContext value={demoSource}>
      <AppShell account={null}>
        <OffersPage />
      </AppShell>
    </DataSourceContext>
  )
}
