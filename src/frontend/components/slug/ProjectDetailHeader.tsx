import { Badge, Box, Button, Code, Group, Skeleton, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbChevronRight,
  TbClock,
  TbFolders,
  TbTag,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { relativeDate, roleColor, tagColor } from '@/frontend/lib/project-utils'

interface ProjectDetailHeaderProps {
  slug: string
  project:
    | {
        name: string
        description?: string
        tags?: string[]
        myRole?: string
        members?: unknown[]
        environments?: unknown[]
        createdAt?: string
      }
    | undefined
  envs: { name: string; _count?: { vars: number } }[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  myRole: string
  totalVars: number
  memberCount: number
  projectTags: string[]
  membersActive: boolean
  onManageMembers: () => void
}

export function ProjectDetailHeader({
  slug,
  project,
  envs,
  isLoading,
  isError,
  error,
  refetch,
  myRole,
  totalVars,
  memberCount,
  projectTags,
  membersActive,
  onManageMembers,
}: ProjectDetailHeaderProps) {
  return (
    <>
      <Group mb="md" gap={6} wrap="nowrap" align="center">
        <Button
          variant="subtle"
          size="xs"
          px={8}
          color="gray"
          component={Link}
          to="/envmanager"
          leftSection={<TbArrowLeft size={12} />}
          styles={{ root: { fontWeight: 400 } }}
        >
          Projects
        </Button>
        <TbChevronRight size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        {isLoading ? (
          <Skeleton height={14} width={100} />
        ) : (
          <Text size="sm" fw={500} truncate>
            {project?.name ?? slug}
          </Text>
        )}
      </Group>

      {isLoading ? (
        <Skeleton height={100} mb="md" radius="md" />
      ) : isError ? (
        <Box p="xl" ta="center" mb="md" style={{ border: '1px solid var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Gagal memuat project
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Project tidak ditemukan atau tidak ada akses.'}
          </Text>
          <Group justify="center" gap="xs">
            <Button size="xs" variant="subtle" color="gray" component={Link} to="/envmanager">
              Kembali ke daftar
            </Button>
            <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </Group>
        </Box>
      ) : (
        project && (
          <Box
            p={{ base: 'sm', sm: 'md' }}
            mb="lg"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon
                size={48}
                radius="lg"
                variant="light"
                color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}
                style={{ flexShrink: 0 }}
              >
                <TbFolders size={22} />
              </ThemeIcon>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" mb={4} wrap="nowrap" align="center" justify="space-between">
                  <Group gap="xs" wrap="wrap" align="center" style={{ minWidth: 0 }}>
                    <Text fw={800} size="xl" lh={1.2} style={{ wordBreak: 'break-word' }}>
                      {project.name}
                    </Text>
                    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Code fz="xs">{slug}</Code>
                      <Badge size="sm" variant="light" color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}>
                        {myRole}
                      </Badge>
                    </Group>
                  </Group>
                  {/* Members = administrasi akses, dipisah dari tab konten. */}
                  <Button
                    size="xs"
                    variant={membersActive ? 'filled' : 'light'}
                    color="blue"
                    leftSection={<TbUsers size={13} />}
                    rightSection={
                      <Badge size="xs" circle variant={membersActive ? 'white' : 'light'} color="blue">
                        {memberCount}
                      </Badge>
                    }
                    onClick={onManageMembers}
                    style={{ flexShrink: 0 }}
                  >
                    Members
                  </Button>
                </Group>

                <Text
                  size="sm"
                  lh={1.6}
                  mb="xs"
                  c={project.description ? undefined : 'dimmed'}
                  fs={project.description ? undefined : 'italic'}
                >
                  {project.description || 'Belum ada deskripsi'}
                </Text>

                {projectTags.length > 0 && (
                  <Group gap={4} mb="xs">
                    {projectTags.map((t: string) => (
                      <Badge key={t} size="xs" variant="light" color={tagColor(t)} leftSection={<TbTag size={9} />}>
                        {t}
                      </Badge>
                    ))}
                  </Group>
                )}

                <Group
                  gap="xs"
                  wrap="wrap"
                  pt="xs"
                  mt={4}
                  style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                >
                  <Tooltip label={`${envs.length} environment`} withArrow>
                    <Group gap={4} style={{ cursor: 'default' }}>
                      <TbVariable size={12} color="var(--mantine-color-primary)" />
                      <Text size="xs" fw={600}>
                        {envs.length}
                      </Text>
                      <Text size="xs" c="dimmed">
                        env
                      </Text>
                    </Group>
                  </Tooltip>
                  <Text size="xs" c="dimmed">
                    ·
                  </Text>
                  <Tooltip label={`${totalVars} variabel di semua environment`} withArrow>
                    <Group gap={4} style={{ cursor: 'default' }}>
                      <Box w={6} h={6} bg="var(--mantine-color-teal-5)" style={{ borderRadius: 2 }} />
                      <Text size="xs" fw={600}>
                        {totalVars}
                      </Text>
                      <Text size="xs" c="dimmed">
                        vars
                      </Text>
                    </Group>
                  </Tooltip>
                  {project.createdAt && (
                    <>
                      <Text size="xs" c="dimmed">
                        ·
                      </Text>
                      <Tooltip label={`Dibuat ${new Date(project.createdAt).toLocaleString('id-ID')}`} withArrow>
                        <Group gap={4} style={{ cursor: 'default' }}>
                          <TbClock size={12} color="var(--mantine-color-dimmed)" />
                          <Text size="xs" c="dimmed">
                            {relativeDate(project.createdAt)}
                          </Text>
                        </Group>
                      </Tooltip>
                    </>
                  )}
                </Group>
              </Box>
            </Group>
          </Box>
        )
      )}
    </>
  )
}
