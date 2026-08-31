import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { seedLocalBoard } from './dev/seed'
import { db } from './lib/db'
import './styles/tokens.css'
import './styles/base.css'

// `/?seed` loads a demo board covering every ring case. Dev and local store
// only, and it must run before the first read, so it stays a plain call.
if (import.meta.env.DEV && db.kind === 'local' && location.search.includes('seed')) {
  seedLocalBoard()
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
