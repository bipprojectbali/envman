import { useRouterState } from '@tanstack/react-router'
import {
  TbBook,
  TbBrandGithub,
  TbCode,
  TbDatabase,
  TbHome,
  TbKey,
  TbLayoutDashboard,
  TbPlugConnected,
  TbUser,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { hasCapability, type User, useSession } from '@/frontend/hooks/useAuth'
import { useExtensions } from '@/frontend/hooks/useExtensions'

export function useEnvManagerNav() {
  const { data } = useSession()
  const user: User | null | undefined = data?.user
  const { data: extensions } = useExtensions()
  const portainerEnabled = extensions?.portainer ?? true
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const isOverview = pathname === '/envmanager/overview'
  const isTokens = pathname.startsWith('/envmanager/tokens')
  const isConnections = pathname.startsWith('/envmanager/connections')
  const isReadme = pathname.startsWith('/envmanager/docs')
  const isGists = pathname.startsWith('/envmanager/gists')
  const isDatabase = pathname.startsWith('/envmanager/database')
  const isUsers = pathname.startsWith('/envmanager/users')
  const isProjectsActive =
    !isOverview && !isTokens && !isConnections && !isReadme && !isGists && !isDatabase && !isUsers

  const mainNav = [
    ...(hasCapability(user, 'menu:overview')
      ? [{ label: 'Overview', description: 'Ringkasan semua resources', icon: TbHome, href: '/envmanager/overview', active: isOverview }]
      : []),
    { label: 'Projects', description: 'Kelola environment vars', icon: TbVariable, href: '/envmanager', active: isProjectsActive },
    ...(hasCapability(user, 'menu:tokens')
      ? [{ label: 'Tokens', description: 'API token untuk CLI', icon: TbKey, href: '/envmanager/tokens', active: isTokens }]
      : []),
    ...(hasCapability(user, 'menu:gists')
      ? [{ label: 'Gists', description: 'Snippets & konfigurasi', icon: TbBrandGithub, href: '/envmanager/gists', active: isGists }]
      : []),
    ...(user?.role === 'SUPER_ADMIN'
      ? [
          { label: 'Database', description: 'Sync data dari remote', icon: TbDatabase, href: '/envmanager/database', active: isDatabase },
          { label: 'Users', description: 'Kelola akses user', icon: TbUsers, href: '/envmanager/users', active: isUsers },
        ]
      : []),
  ]

  const otherNav = [
    // Dashboard hanya untuk QC + SUPER_ADMIN (ticket workflow). ADMIN tidak.
    ...(user?.role === 'QC' || user?.role === 'SUPER_ADMIN'
      ? [{ label: 'Dashboard', icon: TbLayoutDashboard, href: '/dashboard', active: false }]
      : []),
    ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Dev Console', icon: TbCode, href: '/dev', active: false }] : []),
    { label: 'Docs', icon: TbBook, href: '/envmanager/docs', active: isReadme },
  ]

  const extensionsNav = [
    ...(portainerEnabled && (user?.role === 'SUPER_ADMIN' || hasCapability(user, 'menu:connections'))
      ? [{ label: 'Portainer', description: 'Connections & backup', icon: TbPlugConnected, href: '/envmanager/connections', active: isConnections }]
      : []),
  ]

  const bottomTabs = [
    ...(hasCapability(user, 'menu:overview') ? [{ label: 'Overview', icon: TbHome, href: '/envmanager/overview', active: isOverview }] : []),
    { label: 'Projects', icon: TbVariable, href: '/envmanager', active: isProjectsActive },
    ...(hasCapability(user, 'menu:tokens') ? [{ label: 'Tokens', icon: TbKey, href: '/envmanager/tokens', active: isTokens }] : []),
    ...(hasCapability(user, 'menu:gists') ? [{ label: 'Gists', icon: TbBrandGithub, href: '/envmanager/gists', active: isGists }] : []),
    { label: 'Profil', icon: TbUser, href: '/profile', active: false },
  ]

  return { user, mainNav, otherNav, extensionsNav, bottomTabs }
}
