# Frontend

React 19 + Vite 8 (middleware mode in dev). File-based routing with TanStack Router.

## Entry Points

- `src/frontend.tsx` — renders App, removes splash screen, DevInspector in dev
- `src/frontend/App.tsx` — MantineProvider (auto color scheme), ModalsProvider, QueryClientProvider, RouterProvider

## Routes (`src/frontend/routes/`)

- `__root.tsx` — Root layout (Outlet only, no floating UI)
- `index.tsx` — Landing page (theme toggle top-right)
- `login.tsx` — Login page (email/password + Google OAuth)
- `dev.tsx` — Dev console (SUPER_ADMIN): Overview, Users, App Logs, User Logs, Database, Project, Settings
- `dashboard.tsx` — Admin dashboard (ADMIN+): Dashboard, Tickets, Analytics, Settings. Links to `/envmanager` and `/dev`.
- `envmanager.tsx` — Env Manager layout (AppShell sidebar, `<Outlet />`). Auth: ADMIN+
- `envmanager.index.tsx` — `/envmanager` project list; search (nama/slug/desc), filter multi-tag, TagsInput di modal create, warna tag deterministik via hash; search+tagFilter persist ke `localStorage`
- `envmanager.tokens.lazy.tsx` — `/envmanager/tokens` API token management; filter by project (`MultiSelect`)
- `envmanager.connections.tsx` — `/envmanager/connections` global Portainer connection CRUD
- `envmanager.$slug.tsx` — `/envmanager/:slug` pure `<Outlet />` layout
- `envmanager.$slug.index.tsx` — project detail content (environments + notes + aliases tabs, `?tab=environments|notes|aliases`)
- `envmanager.$slug.$env.tsx` — `/envmanager/:slug/:env` env vars page
- `profile.tsx` — User profile (all authenticated users)
- `blocked.tsx` — Blocked user info page

## Components (`src/frontend/components/`)

- `ThemeToggle.tsx` — dark/light mode toggle (shared across all pages)
- `TicketsPanel.tsx` — shared between `/dev` and `/dashboard`, QC-filtered for QC role
- `PortainerSync.tsx` — Portainer sync UI
- `NotFound.tsx` — 404 page
- `ErrorPage.tsx` — Error boundary page
- `slug/AliasesPanel.tsx` — aliases tab untuk project detail; OWNER bisa create/edit/delete; semua member bisa list dan copy CLI invocation (`envman run slug:name`)
- `slug/FilesPanel.tsx` — files tab untuk project detail; mirip Gist tapi per-project; EDITOR+ bisa create/edit/delete milik sendiri; OWNER bisa edit semua; mendukung multi-file, preview Markdown, search, tag filter, pagination
- `env/CompareModal.tsx` — bandingkan .env local (paste) dengan vars di envman. Kategori: diff, only_local, only_envman, sync, uncertain (untuk secret yang masked). EDITOR+ bisa bulk add/update; VIEWER hanya read-only diff. Pakai `/vars/export` (EDITOR+) atau `/vars?limit=10000` (VIEWER).

## Hooks

- `src/frontend/hooks/useAuth.ts` — `useSession()`, `useLogin()`, `useLogout()`, `getDefaultRoute(role)`
- `src/frontend/hooks/usePresence.ts` — WebSocket auto-connect, exposes `onlineUserIds`

## UI Patterns

**Sidebar**: Collapsible (260px expanded → 60px icon-only). State in `localStorage` (`dev:sidebar`, `dashboard:sidebar`).

**Dark/Light mode**: Auto from device preference. Toggle per-page: sidebar footer (dev/dashboard), top-right (landing/login/blocked), header (profile). Flash-free: `index.html` reads `localStorage` before first paint.

**Logout**: Confirm modal via `@mantine/modals` on dev, dashboard, profile. Blocked page logs out directly.

**Tag colors**: Warna tag digenerate deterministik dari nama tag via hash (tidak disimpan di DB). Fungsi `tagColor(tag)` ada di `envmanager.index.tsx` — reuse untuk fitur lain yang butuh warna tag konsisten. Badge pakai `variant="light" color={tagColor(tag)}`.

## Dev Console Visualizations

### Database tab
- ER diagram via `@xyflow/react`. `GET /api/admin/schema` parses `prisma/schema.prisma`.
- Custom nodes: `ModelNode`, `EnumNode`. Auto-save positions + viewport to `localStorage`.

### Project tab (10 sub-views)

**Architecture:**
- API Routes — HTTP + WS routes with method/auth badges, login→redirect edges
- File Structure — file nodes with import dependency edges, double-click opens in editor
- User Flow — static role-based navigation map
- Data Flow — static request lifecycle diagram

**DevOps:**
- Env Variables — set/unset status, edges to consuming files
- Test Coverage — color-coded source files (green/yellow/red), edges to test files
- Dependencies — NPM packages by category, edges to importers
- Migrations — horizontal timeline with SQL preview

**Live:**
- Sessions — active sessions, online status, auto-refresh 10s
- Live Requests — real-time via WS broadcast, hit counters, avg response time

Each sub-view has independent auto-save via `useFlowAutoSave(key)`.
