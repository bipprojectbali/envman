import {
  Alert,
  Box,
  Code,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TbAlertTriangle,
  TbBan,
  TbCheck,
  TbInfoCircle,
  TbLock,
  TbShieldCheck,
  TbUser,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { GLOBAL_ROLE_COLOR } from './types'
import type { GlobalRole, UserDetail } from './types'

const ROLE_DESCRIPTIONS: Record<GlobalRole, { label: string; description: string; icon: typeof TbUser }> = {
  USER: { label: 'USER', description: 'Default. Tidak punya hak istimewa. Lihat profile saja.', icon: TbUser },
  QC: { label: 'QC', description: 'Akses dashboard ticket (QC workflow). Tidak ke envmanager.', icon: TbShieldCheck },
  ADMIN: { label: 'ADMIN', description: 'Akses envmanager. Hak harus di-grant via capability.', icon: TbShieldCheck },
  SUPER_ADMIN: { label: 'SUPER_ADMIN', description: 'Bypass semua. Akses penuh ke /dev, /envmanager, /dashboard.', icon: TbLock },
}

export function ProfileTab({ user }: { user: UserDetail }) {
  const qc = useQueryClient()
  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  const roleMutation = useMutation({
    mutationFn: (role: GlobalRole) =>
      apiFetch(`/api/admin/users/${user.id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    onSuccess: () => {
      notifyOk('Role berhasil diubah')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', user.id, 'access'] })
    },
    onError: (e) => notifyErr(e),
  })

  const blockMutation = useMutation({
    mutationFn: (blocked: boolean) =>
      apiFetch(`/api/admin/users/${user.id}/block`, { method: 'PUT', body: JSON.stringify({ blocked }) }),
    onSuccess: () => {
      notifyOk('Status diperbarui')
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'envman-users', user.id, 'access'] })
    },
    onError: (e) => notifyErr(e),
  })

  return (
    <Stack gap="md">
      {/* Global Role */}
      <Box p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
        <Group gap="xs" mb="xs">
          <ThemeIcon size={22} radius="md" variant="light" color="violet">
            <TbShieldCheck size={13} />
          </ThemeIcon>
          <Text size="sm" fw={600}>Global Role</Text>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          Identity user di sistem. ADMIN tidak punya hak default — semua akses harus di-grant via capability/access matrix.
        </Text>

        {isSuperAdmin ? (
          <Alert color="violet" variant="light" icon={<TbLock size={14} />} p="sm">
            <Text size="xs" fw={500}>SUPER_ADMIN tidak dapat diubah dari sini.</Text>
            <Text size="xs" c="dimmed">Promote/demote SUPER_ADMIN hanya via Prisma Studio atau database langsung.</Text>
          </Alert>
        ) : (
          <SegmentedControl
            value={user.role}
            onChange={(v) => roleMutation.mutate(v as GlobalRole)}
            disabled={roleMutation.isPending}
            color={GLOBAL_ROLE_COLOR[user.role]}
            data={(['USER', 'QC', 'ADMIN'] as const).map(r => ({
              value: r,
              label: (
                <Group gap={5} justify="center" wrap="nowrap">
                  <Box
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: `var(--mantine-color-${GLOBAL_ROLE_COLOR[r]}-5)`,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="xs" fw={500}>{r}</Text>
                </Group>
              ),
            }))}
          />
        )}

        {!isSuperAdmin && (
          <Alert
            color={GLOBAL_ROLE_COLOR[user.role]}
            variant="light"
            mt="sm"
            p="xs"
            icon={<TbInfoCircle size={13} />}
          >
            <Text size="xs">
              <b>{ROLE_DESCRIPTIONS[user.role].label}:</b> {ROLE_DESCRIPTIONS[user.role].description}
            </Text>
          </Alert>
        )}
      </Box>

      {/* Account Status */}
      <Box p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
        <Group gap="xs" mb="xs">
          <ThemeIcon size={22} radius="md" variant="light" color={user.blocked ? 'red' : 'teal'}>
            {user.blocked ? <TbBan size={13} /> : <TbCheck size={13} />}
          </ThemeIcon>
          <Text size="sm" fw={600}>Account Status</Text>
        </Group>

        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1 }}>
            <Text size="sm" fw={500}>{user.blocked ? 'Akun di-block' : 'Akun aktif'}</Text>
            <Text size="xs" c="dimmed">
              {user.blocked
                ? 'User tidak bisa login. Semua session aktif dihapus saat di-block.'
                : 'User bisa login dan menggunakan aplikasi sesuai hak akses.'}
            </Text>
          </Box>
          <Switch
            checked={user.blocked}
            onChange={(e) => blockMutation.mutate(e.currentTarget.checked)}
            disabled={isSuperAdmin || blockMutation.isPending}
            color="red"
            size="md"
            onLabel="ON"
            offLabel="OFF"
          />
        </Group>

        {isSuperAdmin && (
          <Alert color="gray" variant="light" mt="sm" p="xs" icon={<TbLock size={12} />}>
            <Text size="xs" c="dimmed">SUPER_ADMIN tidak bisa di-block.</Text>
          </Alert>
        )}

        {user.blocked && !isSuperAdmin && (
          <Alert color="red" variant="light" mt="sm" p="xs" icon={<TbAlertTriangle size={12} />}>
            <Text size="xs">
              Saat blocked: login akan tertolak, semua session aktif dihapus, dan token API jadi tidak valid.
            </Text>
          </Alert>
        )}
      </Box>

      {/* Catatan */}
      <Alert color="gray" variant="light" icon={<TbInfoCircle size={14} />} p="sm">
        <Text size="xs" c="dimmed" lh={1.6}>
          • Akses per <b>project</b> dan <b>environment</b> → tab <Code fz={10}>Access Matrix</Code>.<br />
          • Grant <b>capability</b> (create project, view connection, dll) → tab <Code fz={10}>Permissions</Code>.<br />
          • Perubahan block/role berlaku <b>seketika</b> tanpa perlu refresh.
        </Text>
      </Alert>
    </Stack>
  )
}
