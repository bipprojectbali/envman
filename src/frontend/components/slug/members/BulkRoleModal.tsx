import { Alert, Badge, Button, Group, Radio, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertTriangle } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyBulkResult, runBulk } from '@/frontend/lib/bulk'
import { type Member, type ProjectRole, roleColor, roleOptions } from './types'

export function BulkRoleModal({
  slug,
  selected,
  members,
  onClose,
}: {
  slug: string
  selected: string[]
  members: Member[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [role, setRole] = useState<ProjectRole>('VIEWER')
  const [submitting, setSubmitting] = useState(false)
  const selectedMembers = members.filter((m) => selected.includes(m.user.id))
  const ownerCount = members.filter((m) => m.role === 'OWNER').length
  const ownersInSelection = selectedMembers.filter((m) => m.role === 'OWNER').length
  const wouldDemoteAllOwners = role !== 'OWNER' && ownersInSelection === ownerCount && ownerCount > 0

  const submit = async () => {
    setSubmitting(true)
    const summary = await runBulk(selectedMembers, (m) =>
      apiFetch(`/api/envman/projects/${slug}/members/${m.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    )
    setSubmitting(false)
    notifyBulkResult(
      summary,
      (n) => `${n} role diperbarui ke ${role}`,
      (n) => `${n} gagal`,
    )
    qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
    onClose()
  }

  return (
    <Stack gap="md">
      <Text size="sm">
        Ubah role <strong>{selected.length}</strong> anggota terpilih:
      </Text>
      <Stack gap={4}>
        {selectedMembers.slice(0, 5).map((m) => (
          <Group key={m.id} gap="xs" wrap="nowrap">
            <Text size="xs" truncate style={{ flex: 1 }}>
              {m.user.name}
            </Text>
            <Badge size="xs" variant="light" color={roleColor[m.role]}>
              {m.role}
            </Badge>
          </Group>
        ))}
        {selectedMembers.length > 5 && (
          <Text size="xs" c="dimmed">
            …dan {selectedMembers.length - 5} lainnya
          </Text>
        )}
      </Stack>
      <Radio.Group value={role} onChange={(v) => setRole(v as ProjectRole)} label="Role baru">
        <Stack gap="xs" mt="xs">
          {roleOptions.map((opt) => (
            <Radio key={opt.value} value={opt.value} label={opt.label} color={roleColor[opt.value]} />
          ))}
        </Stack>
      </Radio.Group>
      {wouldDemoteAllOwners && (
        <Alert color="orange" icon={<TbAlertTriangle size={14} />} variant="light">
          Operasi ini menurunkan semua OWNER project. Last-owner protection di server akan menolak yang terakhir.
        </Alert>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="sm" onClick={onClose} disabled={submitting}>
          Batal
        </Button>
        <Button size="sm" color={roleColor[role]} onClick={submit} loading={submitting}>
          Terapkan
        </Button>
      </Group>
    </Stack>
  )
}
