import { prisma } from './db'
import type { ProjectSection } from '../../generated/prisma/enums'

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export async function getProjectAccess(userId: string, role: string, projectSlug: string): Promise<ProjectRole | null> {
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

// Hybrid resolver:
//   - SUPER_ADMIN → OWNER (bypass)
//   - EnvironmentMember exists:
//       role = null → DENIED (explicit no access)
//       role = OWNER/EDITOR/VIEWER → override
//   - No env record → inherit projectRole
//   - No project membership → no access
export async function getEnvironmentAccess(
  userId: string,
  role: string,
  projectSlug: string,
  envName: string,
): Promise<ProjectRole | null> {
  if (role === 'SUPER_ADMIN') return 'OWNER'
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      members: { where: { userId } },
      environments: {
        where: { name: envName },
        include: { members: { where: { userId } } },
      },
    },
  })
  if (!project) return null

  const env = project.environments[0]
  if (env) {
    const envMember = env.members[0]
    if (envMember) {
      // Record exists. role=null means explicit deny.
      return envMember.role as ProjectRole | null
    }
  }

  const projectMember = project.members[0]
  if (projectMember) return projectMember.role as ProjectRole

  return null
}

// Hybrid resolver untuk section non-env (Notes/Aliases/Files/Storage).
// Semantik identik getEnvironmentAccess:
//   - SUPER_ADMIN → OWNER (bypass)
//   - ProjectSectionMember exists:
//       role = null → DENIED (explicit no access)
//       role = OWNER/EDITOR/VIEWER → override
//   - No section record → inherit projectRole
//   - No project membership → no access
export async function getSectionAccess(
  userId: string,
  role: string,
  projectSlug: string,
  section: ProjectSection,
): Promise<ProjectRole | null> {
  if (role === 'SUPER_ADMIN') return 'OWNER'
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      members: { where: { userId } },
      sectionMembers: { where: { userId, section } },
    },
  })
  if (!project) return null

  const sectionMember = project.sectionMembers[0]
  if (sectionMember) {
    // Record exists. role=null means explicit deny.
    return sectionMember.role as ProjectRole | null
  }

  const projectMember = project.members[0]
  if (projectMember) return projectMember.role as ProjectRole

  return null
}

// Empty scopes = access to all projects the user is member of.
export function tokenScopeAllows(scopes: string[], projectSlug: string, envName: string): boolean {
  if (scopes.length === 0) return true
  return scopes.some((s) => {
    const [p, e] = s.split(':')
    return p === projectSlug && (e === '*' || e === envName)
  })
}
