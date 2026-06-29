import { Alert, Button, Code, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbAlertTriangle, TbTrash } from 'react-icons/tb'

export function DeleteConnectionConfirm({
  name,
  usedBy,
  onCancel,
  onConfirm,
}: {
  name: string
  usedBy: number
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canDelete = typed === name

  const handleConfirm = async () => {
    if (!canDelete || loading) return
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        Connection <strong>{name}</strong> akan dihapus.
      </Text>
      {usedBy > 0 && (
        <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
          <Text size="xs">
            <strong>{usedBy}</strong> environment masih menggunakan connection ini. Setelah dihapus, environment
            tersebut perlu dikonfigurasi ulang sebelum bisa sync ke Portainer.
          </Text>
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        Ketik <Code fz="xs">{name}</Code> untuk mengkonfirmasi:
      </Text>
      <TextInput
        size="sm" placeholder={name} value={typed} autoFocus data-autofocus spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && canDelete) handleConfirm() }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button color="red" leftSection={<TbTrash size={13} />} disabled={!canDelete} loading={loading} onClick={handleConfirm}>
          Hapus Permanen
        </Button>
      </Group>
    </Stack>
  )
}
