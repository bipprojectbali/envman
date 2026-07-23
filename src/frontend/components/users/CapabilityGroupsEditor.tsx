import { Badge, Box, Button, Checkbox, Code, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { type TbKey, TbLayoutDashboard, TbPlugConnected, TbPlus } from 'react-icons/tb'

export const DESTRUCTIVE_CAPABILITIES = ['stack:prune', 'connection:manage'] as const

export interface CapabilityItem {
  value: string
  label: string
  description: string
}

export interface CapabilityGroup {
  label: string
  description: string
  color: string
  icon: typeof TbKey
  items: CapabilityItem[]
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
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
    description: 'Akses ke infra Portainer global — granular agar bisa didelegasikan tanpa SUPER_ADMIN.',
    color: 'orange',
    icon: TbPlugConnected,
    items: [
      {
        value: 'connection:view',
        label: 'View Portainer connections',
        description: 'Lihat list & detail connection, health, probe.',
      },
      {
        value: 'connection:manage',
        label: 'Manage connections (destructive)',
        description: 'Create, edit, dan hapus Portainer connection (dulu SUPER_ADMIN-only).',
      },
      {
        value: 'stack:operate',
        label: 'Operate stacks (read)',
        description: 'View stacks, container logs, compose file, status, stats, dangling images. TIDAK termasuk exec.',
      },
      {
        value: 'stack:exec',
        label: 'Exec into container',
        description: 'Jalankan command di dalam container — setara akses shell. Dipisah dari operate.',
      },
      {
        value: 'stack:sync',
        label: 'Sync env vars',
        description: 'Push env vars environment → stack (sync & sync-preview).',
      },
      { value: 'stack:power', label: 'Power stacks', description: 'Start / stop / restart container atau stack.' },
      { value: 'stack:deploy', label: 'Deploy stacks', description: 'Repull image, recreate stack, sync-repull.' },
      { value: 'stack:mutate', label: 'Edit compose', description: 'Edit compose/stack file.' },
      {
        value: 'stack:prune',
        label: 'Prune resources (destructive)',
        description: 'Hapus images/volumes/networks/containers yang tidak terpakai.',
      },
      { value: 'backup:view', label: 'View backups', description: 'Lihat list & download backup Portainer.' },
      { value: 'backup:manage', label: 'Manage backups', description: 'Create & hapus backup, kelola jadwal backup.' },
    ],
  },
]

interface CapabilityGroupsEditorProps {
  selected: string[]
  onChange: (v: string[]) => void
  onToggleGroup: (group: CapabilityGroup) => void
}

export function CapabilityGroupsEditor({ selected, onChange, onToggleGroup }: CapabilityGroupsEditorProps) {
  return (
    <Checkbox.Group value={selected} onChange={onChange}>
      <Stack gap="md">
        {CAPABILITY_GROUPS.map((group) => {
          const groupValues = group.items.map((i) => i.value)
          const groupSelected = groupValues.filter((v) => selected.includes(v)).length
          const groupTotal = groupValues.length
          const allSelected = groupSelected === groupTotal
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
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <ThemeIcon size={26} radius="md" variant="white" color={group.color} style={{ flexShrink: 0 }}>
                      <group.icon size={14} />
                    </ThemeIcon>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" fw={700} c={group.color} truncate>
                        {group.label}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {group.description}
                      </Text>
                    </Box>
                  </Group>
                  <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Badge size="sm" color={group.color} variant="filled">
                      {groupSelected}/{groupTotal}
                    </Badge>
                    <Button size="xs" variant="subtle" color={group.color} onClick={() => onToggleGroup(group)}>
                      {allSelected ? 'Uncheck all' : 'Check all'}
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
  )
}
