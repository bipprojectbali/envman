import { Badge, Group, Select, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbLock, TbShieldCheck } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'
type EnvRole = 'inherit' | 'denied' | ProjectRole

interface EnvAccessRow {
  name: string
  envRole: EnvRole
  effectiveRole: ProjectRole | null
}

const envRoleOptions: { value: EnvRole; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'OWNER', label: 'Owner' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'denied', label: 'Denied' },
]

const effectiveColor: Record<string, string> = {
  OWNER: 'blue',
  EDITOR: 'teal',
  VIEWER: 'gray',
  DENIED: 'red',
}

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
    queryKey: ['envman', 'member-env-access', slug, userId],
    queryFn: async () => {
      // Fetch per-env override list — pakai endpoint env-members list per env.
      const rows: EnvAccessRow[] = []
      for (const env of environments) {
        const res = await apiFetch<{
          members: {
            userId: string
            envRole: EnvRole
            effectiveRole: ProjectRole | null
          }[]
        }>(`/api/envman/projects/${slug}/environments/${env.name}/members`)
        const mine = res.members.find((m) => m.userId === userId)
        if (mine) {
          rows.push({ name: env.name, envRole: mine.envRole, effectiveRole: mine.effectiveRole })
        } else {
          rows.push({ name: env.name, envRole: 'inherit', effectiveRole: projectRole })
        }
      }
      return rows
    },
    staleTime: 10_000,
  })

  const setRoleMutation = useMutation({
    mutationFn: ({ env, role }: { env: string; role: EnvRole }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_d, vars) => {
      notifyOk(`Akses env "${vars.env}" diperbarui`)
      qc.invalidateQueries({ queryKey: ['envman', 'member-env-access', slug, userId] })
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
  if (!data || data.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        Project ini belum punya environment.
      </Text>
    )
  }

  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em' }}>
        Akses Per Environment
      </Text>
      {data.map((row) => {
        const eff = row.effectiveRole ?? 'DENIED'
        return (
          <Group key={row.name} gap="sm" wrap="nowrap" align="center" py={2}>
            <Group gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={600} truncate>
                {row.name}
              </Text>
              <Badge
                size="xs"
                variant={row.effectiveRole === null ? 'filled' : 'light'}
                color={effectiveColor[eff] ?? 'gray'}
                leftSection={row.effectiveRole === null ? <TbLock size={9} /> : <TbShieldCheck size={9} />}
              >
                {eff}
              </Badge>
            </Group>
            <Select
              size="xs"
              data={envRoleOptions}
              value={row.envRole}
              onChange={(v) => {
                if (v && v !== row.envRole) setRoleMutation.mutate({ env: row.name, role: v as EnvRole })
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
