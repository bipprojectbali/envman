import { Badge, Box, Chip, Code, Divider, Group, Select, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TbBan, TbCheck, TbShieldCheck } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
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

  const handleProjectRoleChange = (value: string | null) => {
    const newRole = value === '' || value === null ? null : (value as ProjectRole)
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

  const hasRestricted = project.environments.some((e) => e.envRole === 'denied')
  const hasOverride = project.environments.some((e) => e.envRole !== 'inherit')
  const roleColor = project.projectRole ? ROLE_COLOR[project.projectRole] : 'gray'

  return (
    <Box
      p="sm"
      style={{
        overflow: 'visible',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      {/* Project header */}
      <Group justify="space-between" wrap="nowrap" mb="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ThemeIcon size={26} radius="md" variant="light" color={roleColor}>
            {project.projectRole ? <TbCheck size={13} /> : <TbBan size={13} />}
          </ThemeIcon>
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={600} truncate>
              {project.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              <Code fz={10}>{project.slug}</Code>
              {project.environments.length > 0 &&
                ` · ${project.environments.length} env${project.environments.length !== 1 ? 's' : ''}`}
            </Text>
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap">
          {hasRestricted && (
            <Tooltip label="Ada env yang di-deny" withArrow>
              <Badge size="xs" color="red" variant="dot">
                restricted
              </Badge>
            </Tooltip>
          )}
          {!hasRestricted && hasOverride && (
            <Tooltip label="Ada env dengan role override" withArrow>
              <Badge size="xs" color="orange" variant="dot">
                override
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Group>

      {/* Project default role */}
      <Group gap="xs" mb={6}>
        <ThemeIcon size={16} radius="sm" variant="light" color="violet">
          <TbShieldCheck size={10} />
        </ThemeIcon>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Default role
        </Text>
      </Group>
      <Chip.Group
        value={project.projectRole ?? 'none'}
        onChange={(v) => handleProjectRoleChange(v === 'none' ? null : (v as ProjectRole))}
      >
        <Group gap={6}>
          {(
            [
              { value: 'none', label: 'No access', color: 'red' },
              { value: 'VIEWER', label: 'VIEWER', color: ROLE_COLOR.VIEWER },
              { value: 'EDITOR', label: 'EDITOR', color: ROLE_COLOR.EDITOR },
              { value: 'OWNER', label: 'OWNER', color: ROLE_COLOR.OWNER },
            ] as const
          ).map((opt) => (
            <Chip key={opt.value} value={opt.value} size="xs" color={opt.color} disabled={setProjectRole.isPending}>
              {opt.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>

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
          <Stack gap={4}>
            {project.environments.map((env) => {
              const envColor =
                env.envRole === 'denied' ? 'red' : env.effectiveRole ? ROLE_COLOR[env.effectiveRole] : 'gray'
              return (
                <Group key={env.name} gap="xs" wrap="nowrap" align="center">
                  <Box
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: `var(--mantine-color-${envColor}-5)`,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="xs" fw={500} style={{ flex: 1, minWidth: 0 }} truncate>
                    {env.name}
                  </Text>
                  {env.envRole === 'denied' ? (
                    <Badge size="xs" color="red" variant="filled" leftSection={<TbBan size={9} />}>
                      DENIED
                    </Badge>
                  ) : env.envRole === 'inherit' ? (
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      inherit
                    </Text>
                  ) : env.effectiveRole ? (
                    <Badge size="xs" color={ROLE_COLOR[env.effectiveRole]} variant="light">
                      {env.effectiveRole}
                    </Badge>
                  ) : null}
                  <Select
                    value={env.envRole}
                    data={[
                      {
                        value: 'inherit',
                        label: project.projectRole ? `Inherit (${project.projectRole})` : 'Inherit (no access)',
                      },
                      { value: 'VIEWER', label: 'VIEWER' },
                      { value: 'EDITOR', label: 'EDITOR' },
                      { value: 'OWNER', label: 'OWNER' },
                      { value: 'denied', label: 'No access (deny)' },
                    ]}
                    onChange={(v) => v && setEnvRole.mutate({ envName: env.name, role: v as EnvRoleValue })}
                    disabled={setEnvRole.isPending}
                    size="xs"
                    style={{ width: 180, flexShrink: 0 }}
                    allowDeselect={false}
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
