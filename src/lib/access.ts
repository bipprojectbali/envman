import { prisma } from './db'

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export async function getProjectAccess(
  userId: string,
  role: string,
  projectSlug: string,
): Promise<ProjectRole | null> {
  if (role === 'SUPER_ADMIN') return 'OWNER'
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: { members: { where: { userId } } },
  })
  if (!project) return null
  const member = project.members[0]
  if (!member) return null
  return member.role as ProjectRole
}

// Empty scopes = access to all projects the user is member of.
export function tokenScopeAllows(scopes: string[], projectSlug: string, envName: string): boolean {
  if (scopes.length === 0) return true
  return scopes.some(s => {
    const [p, e] = s.split(':')
    return p === projectSlug && (e === '*' || e === envName)
  })
}
