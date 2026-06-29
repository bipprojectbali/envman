import { Badge, Group, Select, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbLock, TbShieldCheck } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { AccessMatrix, EnvRole, ProjectRole } from './members/types'
import { effectiveColor, envRoleOptions } from './members/types'

export function MemberEnvOverrides({
  slug,
  userId,
  projectRole,
  environments,
}: {
  slug: string
  userId: string
  projectRole: ProjectRole
  environments: { name: string }[]
}) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'access-matrix', slug],
    queryFn: () => apiFetch<AccessMatrix>(`/api/envman/projects/${slug}/access-matrix`),
    staleTime: 30_000,
  })

  const setRoleMutation = useMutation({
    mutationFn: ({ env, role }: { env: string; role: EnvRole }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_d, vars) => {
      notifyOk(`Akses env "${vars.env}" diperbarui`)
      qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    },
    onError: (e) => notifyErr(e),
  })

  if (isLoading) {
    return (
      <Text size="xs" c="dimmed">
        Memuat akses env...
      </Text>
    )
  }
  if (!data) {
    return (
      <Text size="xs" c="dimmed">
        Gagal memuat akses env.
      </Text>
    )
  }
  if (environments.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        Project ini belum punya environment.
      </Text>
    )
  }

  const memberRow = data.members.find((m) => m.userId === userId)

  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em' }}>
        Akses Per Environment
      </Text>
      {environments.map((env) => {
        const cell = memberRow?.envAccess[env.name]
        const envRole: EnvRole = cell?.envRole ?? 'inherit'
        const effective = cell?.effectiveRole ?? (envRole === 'inherit' ? projectRole : null)
        const eff = effective ?? 'DENIED'
        const isDenied = effective === null
        return (
          <Group key={env.name} gap="sm" wrap="nowrap" align="center" py={2}>
            <Group gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={600} truncate>
                {env.name}
              </Text>
              <Badge
                size="xs"
                variant={isDenied ? 'filled' : 'light'}
                color={effectiveColor[eff] ?? 'gray'}
                leftSection={isDenied ? <TbLock size={9} /> : <TbShieldCheck size={9} />}
              >
                {eff}
              </Badge>
            </Group>
            <Select
              size="xs"
              data={envRoleOptions}
              value={envRole}
              onChange={(v) => {
                if (v && v !== envRole) setRoleMutation.mutate({ env: env.name, role: v as EnvRole })
              }}
              w={110}
              allowDeselect={false}
              disabled={setRoleMutation.isPending}
            />
          </Group>
        )
      })}
    </Stack>
  )
}
