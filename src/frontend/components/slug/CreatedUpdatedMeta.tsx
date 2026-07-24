import { Group, Text, Tooltip } from '@mantine/core'
import { TbClock, TbEdit } from 'react-icons/tb'
import { relativeDate } from '@/frontend/lib/project-utils'

function absolute(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Meta waktu "Dibuat: X · Diupdate: Y" dua baris eksplisit, dengan tooltip
// absolut. Baris "Diupdate" hanya muncul bila item pernah benar-benar diubah
// (selisih > 1 menit) — jika tidak, updated == created dan menampilkannya
// redundan. updatedAt opsional (mis. model yang belum punya kolomnya).
export function CreatedUpdatedMeta({
  createdAt,
  updatedAt,
  size = 'xs',
}: {
  createdAt?: string
  updatedAt?: string
  size?: 'xs' | 'sm'
}) {
  if (!createdAt) return null
  const wasEdited = updatedAt ? new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60_000 : false

  return (
    <Group gap={size === 'sm' ? 'sm' : 'xs'} wrap="wrap">
      <Tooltip label={`Dibuat ${absolute(createdAt)}`} withArrow fz="xs">
        <Group gap={3} wrap="nowrap" style={{ cursor: 'default' }}>
          <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size={size} c="dimmed">
            Dibuat {relativeDate(createdAt)}
          </Text>
        </Group>
      </Tooltip>
      {wasEdited && updatedAt && (
        <Tooltip label={`Diupdate ${absolute(updatedAt)}`} withArrow fz="xs">
          <Group gap={3} wrap="nowrap" style={{ cursor: 'default' }}>
            <TbEdit size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size={size} c="dimmed">
              Diupdate {relativeDate(updatedAt)}
            </Text>
          </Group>
        </Tooltip>
      )}
    </Group>
  )
}
