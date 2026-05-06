import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './frontend/App'

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
