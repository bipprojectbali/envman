import { Badge, Box, Button, Code, Group, Paper, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { TbArrowRight, TbChevronRight, TbFolders, TbPlus } from 'react-icons/tb'
import { envColor, ProjectInitial } from '@/frontend/lib/overview-utils'

interface Props {
  projects: any[]
  recentProjects: any[]
  loadingProjects: boolean
}

export function OverviewProjectsPanel({ projects, recentProjects, loadingProjects }: Props) {
  const navigate = useNavigate()

  return (
    <Paper
      p="md"
      style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon size={24} radius="sm" variant="light" color="primary">
            <TbFolders size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Projects</Text>
          {!loadingProjects && projects.length > 0 && (
            <Badge size="xs" variant="light" color="primary" circle>{projects.length}</Badge>
          )}
        </Group>
        <Button
          size="compact-xs" variant="subtle" color="primary" rightSection={<TbArrowRight size={12} />}
          onClick={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
        >
          Lihat semua
        </Button>
      </Group>

      {loadingProjects ? (
        <Stack gap="xs">
          {[1, 2, 3].map((i) => <Skeleton key={i} height={52} radius="md" />)}
        </Stack>
      ) : recentProjects.length === 0 ? (
        <Box
          p="lg" ta="center"
          style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
        >
          <Text size="sm" c="dimmed" mb="xs">Belum ada project</Text>
          <Button
            size="xs" leftSection={<TbPlus size={13} />}
            onClick={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
          >
            Buat Project
          </Button>
        </Box>
      ) : (
        <Stack gap={6}>
          {recentProjects.map((p: any) => {
            const envs: any[] = p.environments ?? []
            const goTo = () =>
              navigate({
                to: '/envmanager/$slug',
                params: { slug: p.slug },
                search: {
                  tab: 'environments',
                  fileId: undefined, fileNew: false, viewFileId: undefined,
                  aliasId: undefined, aliasNew: false, viewAliasId: undefined,
                  noteId: undefined, noteNew: false, viewNoteId: undefined,
                },
              })
            return (
              <Group
                key={p.slug}
                justify="space-between" p="sm" gap="sm"
                className="envman-overview-row"
                role="link" tabIndex={0} aria-label={`Buka project ${p.name}`}
                onClick={goTo}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo() } }}
                style={{ borderRadius: 8, cursor: 'pointer' }}
              >
                <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
                  <ProjectInitial name={p.name} />
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} mb={3} wrap="nowrap">
                      <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </Text>
                      <Code fz="xs" style={{ flexShrink: 0 }}>{p.slug}</Code>
                    </Group>
                    <Group gap={4} wrap="wrap">
                      {envs.slice(0, 4).map((e: any) => (
                        <Badge key={e.name} size="xs" variant="light" color={envColor(e.name)}>
                          {e.name}{e._count?.vars != null && ` · ${e._count.vars}`}
                        </Badge>
                      ))}
                      {envs.length > 4 && <Text size="xs" c="dimmed">+{envs.length - 4}</Text>}
                      {envs.length === 0 && <Text size="xs" c="dimmed" fs="italic">belum ada env</Text>}
                    </Group>
                  </Box>
                </Group>
                <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
              </Group>
            )
          })}
          {projects.length > 5 && (
            <Text size="xs" c="dimmed" ta="center" mt={2}>+{projects.length - 5} project lainnya</Text>
          )}
        </Stack>
      )}
    </Paper>
  )
}
