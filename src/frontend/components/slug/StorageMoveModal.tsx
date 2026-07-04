import { Badge, Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { TbFolder, TbFolderSymlink } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

interface Props {
  slug: string
  selectedPaths: string[]
  currentPrefix: string
  onSuccess: () => void
  onClose: () => void
}

interface MoveResult { moved: number; errors: string[] }

/** Ambil semua folder unik dari storage secara rekursif (BFS satu level untuk efisiensi). */
async function fetchAllFolders(slug: string): Promise<string[]> {
  const root = await apiFetch<{ folders: string[] }>(`/api/envman/projects/${slug}/storage`)
  const rootFolders = root?.folders ?? []
  const all: string[] = [...rootFolders]
  // Satu level dalam — cukup untuk quick-pick yang berguna
  await Promise.all(
    rootFolders.map(async (f) => {
      const sub = await apiFetch<{ folders: string[] }>(`/api/envman/projects/${slug}/storage?prefix=${encodeURIComponent(f)}`)
      for (const sf of sub?.folders ?? []) all.push(`${f}/${sf}`)
    })
  )
  return all.sort()
}

export function StorageMoveModal({ slug, selectedPaths, currentPrefix, onSuccess, onClose }: Props) {
  const [targetFolder, setTargetFolder] = useState(currentPrefix)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MoveResult | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [fetchingFolders, setFetchingFolders] = useState(true)

  useEffect(() => {
    fetchAllFolders(slug)
      .then(setFolders)
      .catch(() => {})
      .finally(() => setFetchingFolders(false))
  }, [slug])

  async function handleMove() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/envman/projects/${slug}/storage/move`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: selectedPaths, targetFolder: targetFolder.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Gagal memindah file'); setLoading(false); return }
      if (json.errors?.length > 0) {
        setResult({ moved: json.moved, errors: json.errors })
      } else {
        onSuccess(); onClose()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <Stack gap="sm">
        <Text size="sm">{result.moved} file berhasil dipindah.</Text>
        {result.errors.length > 0 && (
          <Stack gap={2}>
            <Text size="sm" c="orange">Gagal ({result.errors.length}):</Text>
            {result.errors.map((e, i) => <Text key={i} size="xs" c="dimmed">• {e}</Text>)}
          </Stack>
        )}
        <Group justify="flex-end">
          <Button onClick={() => { onSuccess(); onClose() }}>Tutup</Button>
        </Group>
      </Stack>
    )
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Memindah {selectedPaths.length} file. Kosongkan target untuk memindah ke root.
      </Text>

      {/* Referensi otomatis — folder yang sudah ada */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">Pilih cepat:</Text>
        {fetchingFolders ? (
          <Loader size="xs" />
        ) : (
          <Group gap={6} style={{ flexWrap: 'wrap' }}>
            <Badge
              variant={targetFolder === '' ? 'filled' : 'outline'}
              color="gray"
              style={{ cursor: 'pointer' }}
              onClick={() => setTargetFolder('')}
            >
              root
            </Badge>
            {folders.map((f) => (
              <Badge
                key={f}
                variant={targetFolder === f ? 'filled' : 'outline'}
                color="teal"
                leftSection={<TbFolder size={10} />}
                style={{ cursor: 'pointer' }}
                onClick={() => setTargetFolder(f)}
              >
                {f}
              </Badge>
            ))}
            {folders.length === 0 && (
              <Text size="xs" c="dimmed">Belum ada folder — ketik nama folder baru di bawah.</Text>
            )}
          </Group>
        )}
      </Stack>

      {/* Input manual */}
      <TextInput
        label="Atau ketik path manual"
        placeholder="Contoh: assets/images  (kosong = root)"
        value={targetFolder}
        onChange={(e) => setTargetFolder(e.target.value)}
        disabled={loading}
        description="Path relatif dalam project storage"
      />

      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>Batal</Button>
        <Button leftSection={<TbFolderSymlink size={14} />} onClick={handleMove} loading={loading}>
          Pindah
        </Button>
      </Group>
    </Stack>
  )
}
