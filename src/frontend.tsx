import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './frontend/App'

// Stale chunk handler: saat deploy baru, browser mungkin punya chunk lama
// ter-cache dengan immutable headers yang merujuk asset hash berbeda.
// Vite fires 'vite:preloadError' saat lazy chunk gagal dimuat (404).
// Solusi: reload sekali otomatis → browser ambil index.html + chunk baru.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const RELOAD_KEY = '_vite_reload'
  if (!sessionStorage.getItem(RELOAD_KEY)) {
    sessionStorage.setItem(RELOAD_KEY, '1')
    window.location.reload()
  }
  // Sudah pernah reload tapi masih error → biarkan error muncul (hindari loop)
})

// DevInspector hanya di-import saat dev (tree-shaken di production)
const InspectorWrapper = import.meta.env?.DEV
  ? (await import('./frontend/DevInspector')).DevInspector
  : ({ children }: { children: ReactNode }) => <>{children}</>

function removeLoading() {
  const el = document.getElementById('loading')
  if (!el) return
  el.classList.add('fade-out')
  setTimeout(() => el.remove(), 250)
}

const elem = document.getElementById('root')!
const app = (
  <InspectorWrapper>
    <App />
  </InspectorWrapper>
)

// HMR-safe: reuse root agar React state preserved saat hot reload
if (import.meta.hot) {
  import.meta.hot.data.root ??= createRoot(elem)
  import.meta.hot.data.root.render(app)
} else {
  createRoot(elem).render(app)
}

removeLoading()
