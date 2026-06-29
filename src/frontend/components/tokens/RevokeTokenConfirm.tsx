import { Button, Code, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbTrash } from 'react-icons/tb'

interface Props {
  name: string
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

export function RevokeTokenConfirm({ name, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canConfirm = typed === name

  const handleConfirm = async () => {
    if (!canConfirm || loading) return
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
        Token <strong>{name}</strong> akan dihapus permanen. Semua script/CI yang masih menggunakan token ini akan
        langsung gagal autentikasi.
      </Text>
      <Text size="xs" c="dimmed">
        Ketik <Code fz="xs">{name}</Code> untuk mengkonfirmasi:
      </Text>
      <TextInput
        size="sm"
        placeholder={name}
        value={typed}
        autoFocus
        data-autofocus
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm() }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button
          color="red"
          leftSection={<TbTrash size={13} />}
          disabled={!canConfirm}
          loading={loading}
          onClick={handleConfirm}
        >
          Revoke Permanen
        </Button>
      </Group>
    </Stack>
  )
}
