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
//
// Selain role, section member juga bisa punya `scopeTags` (limit-by-tag di dalam
// section). `getSectionAccessWithScope` adalah primitif yang membaca DB sekali dan
// mengembalikan keduanya; `getSectionAccess`/`getSectionTagScope` adalah wrapper
// tipis di atasnya supaya call-site lama (yang hanya butuh role) tak berubah.
export async function getSectionAccessWithScope(
  userId: string,
  role: string,
  projectSlug: string,
  section: ProjectSection,
): Promise<{ role: ProjectRole | null; scopeTags: string[] }> {
  if (role === 'SUPER_ADMIN') return { role: 'OWNER', scopeTags: [] }
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      members: { where: { userId } },
      sectionMembers: { where: { userId, section } },
    },
  })
  if (!project) return { role: null, scopeTags: [] }

  const sectionMember = project.sectionMembers[0]
  if (sectionMember) {
    // Record exists. role=null means explicit deny. scopeTags only bites when a
    // role is granted; on deny it's irrelevant.
    return {
      role: sectionMember.role as ProjectRole | null,
      scopeTags: sectionMember.role ? sectionMember.scopeTags : [],
    }
  }

  const projectMember = project.members[0]
  if (projectMember) return { role: projectMember.role as ProjectRole, scopeTags: [] }

  return { role: null, scopeTags: [] }
}

export async function getSectionAccess(
  userId: string,
  role: string,
  projectSlug: string,
  section: ProjectSection,
): Promise<ProjectRole | null> {
  return (await getSectionAccessWithScope(userId, role, projectSlug, section)).role
}

// Tag scope caller untuk sebuah section. [] = full access (lihat semua item,
// termasuk yang tak bertag). Non-kosong = limit-by-tag (OR match).
export async function getSectionTagScope(
  userId: string,
  role: string,
  projectSlug: string,
  section: ProjectSection,
): Promise<string[]> {
  return (await getSectionAccessWithScope(userId, role, projectSlug, section)).scopeTags
}

// ── Pure tag-scope helpers (testable tanpa DB) ────────────────────────────────

// True bila caller boleh melihat/menyentuh sebuah item. Scope kosong = full
// access. Selain itu, OR-match: item harus punya ≥1 tag yang ada di scope. Item
// tanpa tag (itemTags=[]) TAK PERNAH lolos saat scope non-kosong → hanya
// full-access member yang melihatnya (secure-by-default).
export function canAccessItem(itemTags: string[], scopeTags: string[]): boolean {
  if (scopeTags.length === 0) return true
  return itemTags.some((t) => scopeTags.includes(t))
}

// Menyaring array item yang sudah di-fetch berdasarkan scope. Dipakai di
// endpoint list yang hasilnya di-cache global (aliases/files) — filter HARUS
// terjadi setelah cache boundary, per-request.
export function filterByTagScope<T extends { tags: string[] }>(items: T[], scopeTags: string[]): T[] {
  if (scopeTags.length === 0) return items
  return items.filter((i) => canAccessItem(i.tags, scopeTags))
}

// Fragment `where` Prisma untuk endpoint list yang query langsung ke DB.
// Scope kosong → {} (tanpa filter). Non-kosong → hasSome (untagged auto-exclude).
export function tagScopeWhere(scopeTags: string[]): { tags?: { hasSome: string[] } } {
  return scopeTags.length === 0 ? {} : { tags: { hasSome: scopeTags } }
}

// Empty scopes = access to all projects the user is member of.
export function tokenScopeAllows(scopes: string[], projectSlug: string, envName: string): boolean {
  if (scopes.length === 0) return true
  return scopes.some((s) => {
    const [p, e] = s.split(':')
    return p === projectSlug && (e === '*' || e === envName)
  })
}
