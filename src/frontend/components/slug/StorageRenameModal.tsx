import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbPencil } from 'react-icons/tb'

interface Props {
  slug: string
  file: { path: string }
  onSuccess: () => void
  onClose: () => void
}

export function StorageRenameModal({ slug, file, onSuccess, onClose }: Props) {
  const currentName = file.path.split('/').pop() ?? file.path
  const [name, setName] = useState(currentName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRename() {
    const newName = name.trim()
    if (!newName || newName === currentName) { onClose(); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/envman/projects/${slug}/storage/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldPath: file.path, newName }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Rename gagal'); setLoading(false); return }
      onSuccess(); onClose()
    } catch {
      setError('Koneksi gagal'); setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{file.path}</Text>
      <TextInput
        label="Nama baru"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
        disabled={loading}
        autoFocus
      />
      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>Batal</Button>
        <Button leftSection={<TbPencil size={14} />} onClick={handleRename} loading={loading}>
          Rename
        </Button>
      </Group>
    </Stack>
  )
}
