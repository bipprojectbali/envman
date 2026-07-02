import { Badge, Box, Divider, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TbBan, TbShieldCheck } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { RolePicker } from './RolePicker'
import type { EnvRoleValue, ProjectAccess, ProjectRole } from './types'
import { ROLE_COLOR } from './types'

export function ProjectAccessItem({ userId, project }: { userId: string; project: ProjectAccess }) {
  const qc = useQueryClient()

  const setProjectRole = useMutation({
    mutationFn: (role: ProjectRole | null) =>
      apiFetch(`/api/envman/admin/users/${userId}/projects/${project.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      notifyOk('Project role updated')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', userId, 'access'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
    },
    onError: (e) => notifyErr(e),
  })

  const setEnvRole = useMutation({
    mutationFn: ({ envName, role }: { envName: string; role: EnvRoleValue }) =>
      apiFetch(`/api/envman/admin/users/${userId}/projects/${project.slug}/envs/${envName}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      notifyOk('Env override updated')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', userId, 'access'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
    },
    onError: (e) => notifyErr(e),
  })

  const handleProjectRoleChange = (value: EnvRoleValue) => {
    // RolePicker default-mode emit 'denied' untuk "No access" → petakan ke null.
    const newRole: ProjectRole | null = value === 'denied' ? null : (value as ProjectRole)
    if (project.projectRole === 'OWNER' && newRole !== 'OWNER') {
      modals.openConfirmModal({
        title: 'Demote OWNER',
        children: <Text size="sm">Yakin menurunkan OWNER project ini? Pastikan masih ada OWNER lain.</Text>,
        labels: { confirm: 'Ya, turunkan', cancel: 'Batal' },
        confirmProps: { color: 'red' },
        onConfirm: () => setProjectRole.mutate(newRole),
      })
    } else {
      setProjectRole.mutate(newRole)
    }
  }

  return (
    <Box
      p="sm"
      style={{
        overflow: 'visible',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      {/* Project default role */}
      <Group justify="space-between" wrap="nowrap" gap="xs" mb={project.environments.length > 0 ? undefined : 0}>
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size={16} radius="sm" variant="light" color="violet">
            <TbShieldCheck size={10} />
          </ThemeIcon>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Default role
          </Text>
        </Group>
        <RolePicker
          includeInheritDeny={false}
          value={project.projectRole}
          onChange={handleProjectRoleChange}
          disabled={setProjectRole.isPending}
        />
      </Group>

      {/* Per-env overrides */}
      {project.environments.length > 0 && (
        <>
          <Divider
            my="sm"
            label={
              <Text size="xs" c="dimmed">
                Per-env override
              </Text>
            }
            labelPosition="left"
          />
          <Stack gap={6}>
            {project.environments.map((env) => {
              const isDenied = env.envRole === 'denied'
              const effColor = isDenied ? 'red' : env.effectiveRole ? ROLE_COLOR[env.effectiveRole] : 'gray'
              const effLabel = isDenied ? 'DENIED' : (env.effectiveRole ?? 'none')
              return (
                <Group key={env.name} gap="xs" wrap="nowrap" align="center">
                  <Box
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: `var(--mantine-color-${effColor}-5)`,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="xs" fw={500} style={{ flex: 1, minWidth: 0 }} truncate>
                    {env.name}
                  </Text>
                  <Badge
                    size="xs"
                    color={effColor}
                    variant={isDenied ? 'filled' : 'light'}
                    leftSection={isDenied ? <TbBan size={9} /> : null}
                    style={{ flexShrink: 0, width: 68 }}
                  >
                    {effLabel}
                  </Badge>
                  <RolePicker
                    includeInheritDeny
                    value={env.envRole}
                    onChange={(role) => setEnvRole.mutate({ envName: env.name, role })}
                    disabled={setEnvRole.isPending}
                  />
                </Group>
              )
            })}
          </Stack>
        </>
      )}
    </Box>
  )
}
