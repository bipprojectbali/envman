import { ADMIN_ROUTES } from './route-manifest-admin'

export const ROUTE_MANIFEST: { method: string; path: string; auth: string; category: string; description: string }[] =
  [
    // Frontend routes
    { method: 'PAGE', path: '/', auth: 'public', category: 'frontend', description: 'Landing page' },
    {
      method: 'PAGE',
      path: '/login',
      auth: 'public',
      category: 'frontend',
      description: 'Login page (email/password + Google OAuth)',
    },
    {
      method: 'PAGE',
      path: '/dev',
      auth: 'superAdmin',
      category: 'frontend',
      description: 'Dev console (SUPER_ADMIN only)',
    },
    {
      method: 'PAGE',
      path: '/dashboard',
      auth: 'admin',
      category: 'frontend',
      description: 'Admin dashboard (ADMIN+)',
    },
    {
      method: 'PAGE',
      path: '/profile',
      auth: 'authenticated',
      category: 'frontend',
      description: 'User profile (all authenticated)',
    },
    {
      method: 'PAGE',
      path: '/blocked',
      auth: 'authenticated',
      category: 'frontend',
      description: 'Blocked user info page',
    },
    // Auth
    {
      method: 'POST',
      path: '/api/auth/login',
      auth: 'public',
      category: 'auth',
      description: 'Email/password login',
    },
    {
      method: 'POST',
      path: '/api/auth/logout',
      auth: 'authenticated',
      category: 'auth',
      description: 'Logout (delete session)',
    },
    {
      method: 'GET',
      path: '/api/auth/session',
      auth: 'public',
      category: 'auth',
      description: 'Check current session',
    },
    {
      method: 'GET',
      path: '/api/auth/google',
      auth: 'public',
      category: 'auth',
      description: 'Google OAuth redirect',
    },
    {
      method: 'GET',
      path: '/api/auth/callback/google',
      auth: 'public',
      category: 'auth',
      description: 'Google OAuth callback',
    },
    // Dev Auth
    {
      method: 'GET',
      path: '/api/dev-auth/login-as/:email',
      auth: 'public',
      category: 'auth',
      description: 'Dev-only: login as any user by email (development only)',
    },
    ...ADMIN_ROUTES,
    // Tickets
    {
      method: 'GET',
      path: '/api/tickets',
      auth: 'qcOrAdmin',
      category: 'tickets',
      description: 'List tickets (filter: status, priority, assigneeId)',
    },
    {
      method: 'POST',
      path: '/api/tickets',
      auth: 'qcOrAdmin',
      category: 'tickets',
      description: 'Create ticket (QC/ADMIN/SUPER_ADMIN)',
    },
    {
      method: 'GET',
      path: '/api/tickets/:id',
      auth: 'qcOrAdmin',
      category: 'tickets',
      description: 'Get ticket detail with comments and evidence',
    },
    {
      method: 'PATCH',
      path: '/api/tickets/:id',
      auth: 'qcOrAdmin',
      category: 'tickets',
      description: 'Update ticket fields (role-based status transitions)',
    },
    {
      method: 'POST',
      path: '/api/tickets/:id/comments',
      auth: 'qcOrAdmin',
      category: 'tickets',
      description: 'Add comment to ticket',
    },
    {
      method: 'POST',
      path: '/api/tickets/:id/evidence',
      auth: 'qcOrAdmin',
      category: 'tickets',
      description: 'Attach evidence (screenshot, commit, test log)',
    },
    // Utility
    { method: 'GET', path: '/health', auth: 'public', category: 'utility', description: 'Health check' },
    {
      method: 'GET',
      path: '/api/version',
      auth: 'public',
      category: 'utility',
      description: 'App name and version from package.json',
    },
    { method: 'GET', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (GET)' },
    { method: 'PUT', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (PUT)' },
    {
      method: 'GET',
      path: '/api/hello/:name',
      auth: 'public',
      category: 'utility',
      description: 'Hello with name param',
    },
    // WebSocket
    {
      method: 'WS',
      path: '/ws/presence',
      auth: 'authenticated',
      category: 'realtime',
      description: 'Real-time presence tracking',
    },
  ]
