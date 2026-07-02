import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  Divider,
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertTriangle, TbCheck, TbChevronDown, TbInfoCircle, TbShieldCheck } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import {
  CAPABILITY_GROUPS,
  type CapabilityGroup,
  CapabilityGroupsEditor,
  DESTRUCTIVE_CAPABILITIES,
} from './CapabilityGroupsEditor'
import type { UserDetail } from './types'

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

  const handleSave = () => {
    const newlyGrantedDestructive = DESTRUCTIVE_CAPABILITIES.filter(
      (cap) => selected.includes(cap) && !user.permissions.includes(cap),
    )
    if (newlyGrantedDestructive.length > 0) {
      modals.openConfirmModal({
        title: (
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" color="red" variant="light">
              <TbAlertTriangle size={13} />
            </ThemeIcon>
            <Text fw={700}>Grant capability destruktif</Text>
          </Group>
        ),
        children: (
          <Stack gap="xs">
            <Text size="sm">
              Anda akan memberi <b>{user.name}</b> capability berikut yang bisa <b>menghapus resource</b>:
            </Text>
            <Stack gap={4} pl="sm">
              {newlyGrantedDestructive.map((cap) => (
                <Group key={cap} gap="xs">
                  <Code fz={11} c="red">
                    {cap}
                  </Code>
                  <Text size="xs" c="dimmed">
                    {cap === 'stack:prune' ? 'Hapus images/volumes/networks/containers tidak terpakai' : ''}
                  </Text>
                </Group>
              ))}
            </Stack>
            <Text size="xs" c="dimmed" mt="xs">
              Operasi ini tidak bisa di-undo. Pastikan user benar-benar perlu.
            </Text>
          </Stack>
        ),
        labels: { confirm: 'Ya, grant', cancel: 'Batal' },
        confirmProps: { color: 'red' },
        onConfirm: () => mutation.mutate(selected),
      })
      return
    }
    mutation.mutate(selected)
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
      <CapabilityGroupsEditor selected={selected} onChange={setSelected} onToggleGroup={toggleGroupAll} />

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
              • <b>Database sync &amp; Users management menu</b> — <b>hanya SUPER_ADMIN</b>.<br />•{' '}
              <b>Project member &amp; env access</b> — diatur per-project di tab <Code fz={10}>Access Matrix</Code>.
              <br />• <b>Project edit/delete &amp; member CRUD</b> — butuh ProjectMember OWNER (bukan capability).
              <br />• <b>Per-env Portainer (sync/deploy/prune)</b> — butuh ProjectMember EDITOR+ <b>atau</b> capability
              terkait (<Code fz={10}>stack:sync</Code>/<Code fz={10}>stack:deploy</Code>/
              <Code fz={10}>stack:prune</Code>). Env vars CRUD tetap butuh EDITOR+.
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
              onClick={handleSave}
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
