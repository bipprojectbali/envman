import { Button, Code, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbTrash } from 'react-icons/tb'

interface Props {
  name: string
  varCount: number
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

export function DeleteEnvConfirm({ name, varCount, onCancel, onConfirm }: Props) {
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
        Akan menghapus environment <strong>{name}</strong>
        {varCount > 0 ? (
          <>
            {' '}
            beserta <strong>{varCount} variabel</strong>
          </>
        ) : (
          ' (kosong)'
        )}
        . Tindakan ini <strong>tidak dapat dibatalkan</strong>.
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canDelete) handleConfirm()
        }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button
          color="red"
          leftSection={<TbTrash size={13} />}
          disabled={!canDelete}
          loading={loading}
          onClick={handleConfirm}
        >
          Hapus Permanen
        </Button>
      </Group>
    </Stack>
  )
}
