import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Collapse,
  Divider,
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbCheck,
  TbChevronDown,
  TbInfoCircle,
  type TbKey,
  TbLayoutDashboard,
  TbPlugConnected,
  TbPlus,
  TbShieldCheck,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { UserDetail } from './types'

interface CapabilityItem {
  value: string
  label: string
  description: string
}

interface CapabilityGroup {
  label: string
  description: string
  color: string
  icon: typeof TbKey
  items: CapabilityItem[]
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    label: 'Create actions',
    description: 'Apa yang boleh dibuat user ini.',
    color: 'teal',
    icon: TbPlus,
    items: [
      {
        value: 'project:create',
        label: 'Create new project',
        description: 'Bisa create project baru (otomatis jadi OWNER).',
      },
      {
        value: 'token:create',
        label: 'Create API token',
        description: 'Bisa create API token untuk CLI/integrasi (scope tetap dibatasi project member).',
      },
      { value: 'gist:create', label: 'Create gist', description: 'Bisa simpan snippet/konfigurasi di Gists.' },
      {
        value: 'ticket:create',
        label: 'Create ticket',
        description: 'Bisa create ticket di tracker. (QC sudah otomatis bisa.)',
      },
      {
        value: 'note:create',
        label: 'Create project note',
        description: 'Bisa create note di project (selain capability, butuh role EDITOR+ di project tersebut).',
      },
    ],
  },
  {
    label: 'Sidebar menu visibility',
    description: 'Menu yang muncul di sidebar envmanager.',
    color: 'blue',
    icon: TbLayoutDashboard,
    items: [
      {
        value: 'menu:overview',
        label: 'Show Overview menu',
        description: 'Akses halaman /envmanager/overview (ringkasan resources).',
      },
      { value: 'menu:tokens', label: 'Show Tokens menu', description: 'Akses halaman /envmanager/tokens.' },
      {
        value: 'menu:connections',
        label: 'Show Connections menu',
        description: 'Akses halaman /envmanager/connections (perlu connection:view juga).',
      },
      { value: 'menu:gists', label: 'Show Gists menu', description: 'Akses halaman /envmanager/gists.' },
    ],
  },
  {
    label: 'Portainer operations',
    description: 'Akses ke infra Portainer global. Bertingkat dari view → operate → mutate → prune.',
    color: 'orange',
    icon: TbPlugConnected,
    items: [
      {
        value: 'connection:view',
        label: 'View Portainer connections',
        description: 'Lihat list & detail connection, health, probe.',
      },
      {
        value: 'stack:operate',
        label: 'Operate stacks (read)',
        description: 'View stacks, container logs, compose file, status, stats, dangling images, exec container.',
      },
      {
        value: 'stack:mutate',
        label: 'Mutate stacks',
        description: 'Edit compose, restart container, repull image, recreate stack.',
      },
      {
        value: 'stack:prune',
        label: 'Prune resources (destructive)',
        description: 'Hapus images/volumes/networks/containers yang tidak terpakai.',
      },
    ],
  },
]

export function PermissionsTab({ user }: { user: UserDetail }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>(user.permissions)
  const [showInfo, setShowInfo] = useState(false)
  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  const mutation = useMutation({
    mutationFn: (perms: string[]) =>
      apiFetch(`/api/envman/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: perms }),
      }),
    onSuccess: () => {
      notifyOk('Permissions updated')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', user.id, 'access'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
    },
    onError: (e) => notifyErr(e),
  })

  if (isSuperAdmin) {
    return (
      <Box
        p="md"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
      >
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={40} radius="xl" variant="gradient">
            <TbShieldCheck size={20} />
          </ThemeIcon>
          <Box>
            <Text size="sm" fw={600}>
              SUPER_ADMIN bypass semua check
            </Text>
            <Text size="xs" c="dimmed">
              SUPER_ADMIN otomatis lulus semua capability check di backend. Tidak perlu di-grant manual.
            </Text>
          </Box>
        </Group>
      </Box>
    )
  }

  const totalCaps = CAPABILITY_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
  const sortedSelected = [...selected].sort()
  const sortedCurrent = [...user.permissions].sort()
  const hasChanges = JSON.stringify(sortedSelected) !== JSON.stringify(sortedCurrent)

  const toggleGroupAll = (group: CapabilityGroup) => {
    const groupValues = group.items.map((i) => i.value)
    const allSelected = groupValues.every((v) => selected.includes(v))
    if (allSelected) {
      setSelected(selected.filter((s) => !groupValues.includes(s)))
    } else {
      setSelected([...new Set([...selected, ...groupValues])])
    }
  }

  return (
    <Stack gap="md">
      {/* Summary */}
      <Box
        p="sm"
        bg="var(--mantine-color-default-hover)"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Box>
            <Text size="xs" c="dimmed">
              Capability granted
            </Text>
            <Group gap={6} align="flex-end">
              <Text size="xl" fw={700} c="violet">
                {selected.length}
              </Text>
              <Text size="sm" c="dimmed" pb={4}>
                / {totalCaps}
              </Text>
            </Group>
          </Box>
          <Box style={{ flex: 1, maxWidth: 240 }}>
            <Progress value={(selected.length / totalCaps) * 100} color="violet" radius="md" size="sm" />
            <Text size="xs" c="dimmed" mt={4} ta="right">
              {Math.round((selected.length / totalCaps) * 100)}% access
            </Text>
          </Box>
        </Group>
      </Box>

      {/* Capability groups */}
      <Checkbox.Group value={selected} onChange={setSelected}>
        <Stack gap="md">
          {CAPABILITY_GROUPS.map((group) => {
            const groupValues = group.items.map((i) => i.value)
            const groupSelected = groupValues.filter((v) => selected.includes(v)).length
            const groupTotal = groupValues.length
            const allSelected = groupSelected === groupTotal
            const someSelected = groupSelected > 0 && groupSelected < groupTotal
            return (
              <Box
                key={group.label}
                style={{
                  overflow: 'hidden',
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-md)',
                }}
              >
                <Box
                  p="sm"
                  style={{
                    background: `var(--mantine-color-${group.color}-light)`,
                    borderBottom: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <ThemeIcon size={26} radius="md" variant="white" color={group.color}>
                        <group.icon size={14} />
                      </ThemeIcon>
                      <Box>
                        <Text size="sm" fw={700} c={group.color}>
                          {group.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {group.description}
                        </Text>
                      </Box>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Badge size="sm" color={group.color} variant="filled">
                        {groupSelected}/{groupTotal}
                      </Badge>
                      <Button size="xs" variant="subtle" color={group.color} onClick={() => toggleGroupAll(group)}>
                        {allSelected ? 'Uncheck all' : someSelected ? 'Check all' : 'Check all'}
                      </Button>
                    </Group>
                  </Group>
                </Box>
                <Stack gap="xs" p="sm">
                  {group.items.map((cap) => (
                    <Box
                      key={cap.value}
                      p="xs"
                      style={{
                        borderRadius: 6,
                        background: selected.includes(cap.value)
                          ? `var(--mantine-color-${group.color}-light)`
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <Checkbox
                        color={group.color}
                        value={cap.value}
                        label={
                          <Group gap="xs">
                            <Text size="sm" fw={500}>
                              {cap.label}
                            </Text>
                            <Code fz={10}>{cap.value}</Code>
                          </Group>
                        }
                        description={cap.description}
                      />
                    </Box>
                  ))}
                </Stack>
              </Box>
            )
          })}
        </Stack>
      </Checkbox.Group>

      {/* Non-capability info */}
      <Box
        style={{
          overflow: 'hidden',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Group p="sm" justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setShowInfo(!showInfo)}>
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="gray">
              <TbInfoCircle size={13} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Aturan akses non-capability
            </Text>
            <Badge size="xs" variant="outline" color="gray">
              read-only info
            </Badge>
          </Group>
          <ActionIcon variant="subtle" size="sm" color="gray">
            <TbChevronDown
              size={14}
              style={{ transform: showInfo ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
            />
          </ActionIcon>
        </Group>
        <Collapse in={showInfo}>
          <Divider />
          <Box p="sm">
            <Text size="xs" c="dimmed">
              • <b>Portainer connection CRUD</b> (create/edit/delete connection itself) — <b>hanya SUPER_ADMIN</b>.
              <br />• <b>Database sync &amp; Users management menu</b> — <b>hanya SUPER_ADMIN</b>.<br />•{' '}
              <b>Project member &amp; env access</b> — diatur per-project di tab <Code fz={10}>Access Matrix</Code>.
              <br />• <b>Project edit/delete &amp; member CRUD</b> — butuh ProjectMember OWNER (bukan capability).
              <br />• <b>Env vars CRUD &amp; per-env Portainer sync</b> — butuh ProjectMember EDITOR+ untuk env
              tersebut.
              <br />• <b>Default landing</b> — ADMIN ke <Code fz={10}>/envmanager</Code>; QC ke{' '}
              <Code fz={10}>/dashboard</Code>; SUPER_ADMIN ke <Code fz={10}>/dev</Code>.
            </Text>
          </Box>
        </Collapse>
      </Box>

      {/* Footer */}
      <Box
        p="sm"
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--mantine-color-body)',
          zIndex: 10,
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Group justify="space-between">
          <Text size="xs" c={hasChanges ? 'orange' : 'dimmed'}>
            {hasChanges
              ? `${Math.abs(selected.length - user.permissions.length)} perubahan belum disimpan`
              : 'Tidak ada perubahan'}
          </Text>
          <Group gap="xs">
            {hasChanges && (
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setSelected(user.permissions)}
                disabled={mutation.isPending}
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              color="violet"
              leftSection={<TbCheck size={14} />}
              onClick={() => mutation.mutate(selected)}
              loading={mutation.isPending}
              disabled={!hasChanges}
            >
              Save permissions
            </Button>
          </Group>
        </Group>
      </Box>
    </Stack>
  )
}
