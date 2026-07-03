import { Badge, Box, Paper, Tabs } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import {
  TbFiles,
  TbFolderOpen,
  TbNote,
  TbTerminal2,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { AliasesPanel } from '@/frontend/components/slug/AliasesPanel'
import { EnvironmentList } from '@/frontend/components/slug/EnvironmentList'
import { FilesPanel } from '@/frontend/components/slug/FilesPanel'
import { MembersPanel } from '@/frontend/components/slug/MembersPanel'
import { NotesPanel } from '@/frontend/components/slug/NotesPanel'
import { ProjectDetailHeader } from '@/frontend/components/slug/ProjectDetailHeader'
import { StoragePanel } from '@/frontend/components/slug/StoragePanel'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'

export const Route = createLazyFileRoute('/envmanager/$slug/')({ component: ProjectDetailPage })

function ProjectDetailPage() {
  const { slug } = Route.useParams()
  const { tab, fileId, fileNew, viewFileId, aliasId, aliasNew, viewAliasId, noteId, noteNew, viewNoteId } = Route.useSearch()
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const myUserId = sessionData?.user?.id
  const canCreateNote = hasCapability(sessionData?.user, 'note:create')

  const setTab = (t: string) =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: { tab: t as 'environments' | 'notes' | 'aliases' | 'files' | 'members' | 'storage', fileId, fileNew, viewFileId, aliasId, aliasNew, viewAliasId, noteId, noteNew, viewNoteId },
    })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
    refetchInterval: 15000,
  })

  const project = data?.project
  const envs = project?.environments ?? []
  const totalVars = envs.reduce((s: number, e: { _count?: { vars: number } }) => s + (e._count?.vars ?? 0), 0)
  const memberCount: number = project?.members?.length ?? 0
  const projectTags: string[] = project?.tags ?? []

  const { data: notesData } = useQuery({ queryKey: ['envman', 'notes', slug], queryFn: () => apiFetch<{ notes: unknown[] }>(`/api/envman/projects/${slug}/notes`), staleTime: 30_000 })
  const { data: aliasesData } = useQuery({ queryKey: ['envman', 'aliases', slug], queryFn: () => apiFetch<{ aliases: unknown[] }>(`/api/envman/projects/${slug}/aliases`), staleTime: 60_000 })
  const { data: filesData } = useQuery({ queryKey: ['envman', 'files', slug], queryFn: () => apiFetch<{ files: unknown[] }>(`/api/envman/projects/${slug}/files`), staleTime: 60_000 })
  const notesCount = notesData?.notes?.length ?? 0
  const aliasesCount = aliasesData?.aliases?.length ?? 0
  const filesCount = filesData?.files?.length ?? 0

  const myRole: string = project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const isOwner = myRole === 'OWNER'

  return (
    <Box>
      <ProjectDetailHeader
        slug={slug} project={project} envs={envs} isLoading={isLoading} isError={isError}
        error={error} refetch={refetch} myRole={myRole} totalVars={totalVars}
        memberCount={memberCount} projectTags={projectTags}
      />

      {!isError && (
        <Tabs value={tab} onChange={(v) => setTab(v ?? 'environments')} variant="pills" color="gray">
          <Tabs.List mb="lg">
            <Tabs.Tab value="environments" leftSection={<TbVariable size={13} />}
              rightSection={!isLoading && envs.length > 0 ? <Badge size="xs" variant="light" color="primary" circle>{envs.length}</Badge> : undefined}>
              Environments
            </Tabs.Tab>
            <Tabs.Tab value="notes" leftSection={<TbNote size={13} />}
              rightSection={notesCount > 0 ? <Badge size="xs" variant="light" color="primary" circle>{notesCount}</Badge> : undefined}>
              Notes
            </Tabs.Tab>
            <Tabs.Tab value="aliases" leftSection={<TbTerminal2 size={13} />}
              rightSection={aliasesCount > 0 ? <Badge size="xs" variant="light" color="primary" circle>{aliasesCount}</Badge> : undefined}>
              Aliases
            </Tabs.Tab>
            <Tabs.Tab value="files" leftSection={<TbFiles size={13} />}
              rightSection={filesCount > 0 ? <Badge size="xs" variant="light" color="primary" circle>{filesCount}</Badge> : undefined}>
              Files
            </Tabs.Tab>
            <Tabs.Tab value="members" leftSection={<TbUsers size={13} />}
              rightSection={memberCount > 0 ? <Badge size="xs" variant="light" color="primary" circle>{memberCount}</Badge> : undefined}>
              Members
            </Tabs.Tab>
            <Tabs.Tab value="storage" leftSection={<TbFolderOpen size={13} />}>
              Storage
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="environments">
            <Paper withBorder p="md" radius="md">
              <EnvironmentList slug={slug} envs={envs} isLoading={isLoading} isOwner={isOwner} canEdit={canEdit} myRole={myRole} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="notes">
            <Paper withBorder p="md" radius="md">
              <NotesPanel slug={slug} canEdit={canEdit} canCreate={canCreateNote} isOwner={isOwner} myUserId={myUserId ?? ''} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="aliases">
            <Paper withBorder p="md" radius="md">
              <AliasesPanel slug={slug} isOwner={isOwner} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="files">
            <Paper withBorder p="md" radius="md">
              <FilesPanel slug={slug} isOwner={isOwner} myUserId={myUserId ?? ''} canEdit={canEdit} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="members">
            <Paper withBorder p="md" radius="md">
              <MembersPanel
                slug={slug} members={project?.members ?? []}
                environments={envs.map((e: { name: string }) => ({ name: e.name }))}
                isOwner={isOwner} myUserId={myUserId ?? ''} onRefresh={refetch}
              />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="storage">
            <Paper withBorder p="md" radius="md">
              <StoragePanel slug={slug} isOwner={isOwner} canEdit={canEdit} />
            </Paper>
          </Tabs.Panel>
        </Tabs>
      )}
    </Box>
  )
}
