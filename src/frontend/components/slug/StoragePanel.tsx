import {
  Anchor, Box, Breadcrumbs, Button, Group, Modal,
  Progress, Skeleton, Stack, Text, ThemeIcon,
} from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCloudUpload, TbFile, TbFolder } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { fmtBytes } from '@/frontend/lib/storage-format'
import { StorageFileRow } from './StorageFileRow'
import { StorageUploadModal } from './StorageUploadModal'

interface StorageObject {
  id: string; path: string; size: number; mimeType: string
  isPublic: boolean; tags: string[]; description: string | null
  createdAt: string; updatedAt: string
}
interface StorageData {
  prefix: string; folders: string[]; files: StorageObject[]
  usage: { usedBytes: number; quotaBytes: number }
}

interface Props { slug: string; isOwner: boolean; canEdit: boolean }

export function StoragePanel({ slug, isOwner, canEdit }: Props) {
  const [prefix, setPrefix] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['storage', slug, prefix] })

  const { data, isLoading } = useQuery<StorageData>({
    queryKey: ['storage', slug, prefix],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/storage${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`),
    staleTime: 30_000,
  })

  const breadcrumbs = prefix ? prefix.split('/') : []

  async function handleDelete(path: string) {
    if (!confirm(`Hapus "${path}"?`)) return
    await fetch(`/api/envman/projects/${slug}/storage?path=${encodeURIComponent(path)}`, {
      method: 'DELETE', credentials: 'include',
    })
    invalidate()
  }

  async function togglePublic(path: string, isPublic: boolean) {
    await fetch(`/api/envman/projects/${slug}/storage/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path, isPublic: !isPublic }),
    })
    invalidate()
  }

  const usage = data?.usage
  const usedPct = usage ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100) : 0
  const usedColor = usedPct > 90 ? 'red' : usedPct > 70 ? 'yellow' : 'blue'

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs">
          <ThemeIcon size={22} radius="md" variant="light" color="teal"><TbFile size={13} /></ThemeIcon>
          <Text size="sm" fw={600}>Storage</Text>
        </Group>
        {canEdit && (
          <Button size="xs" variant="light" leftSection={<TbCloudUpload size={13} />} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        )}
      </Group>

      {usage && (
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">Storage terpakai</Text>
            <Text size="xs" c="dimmed">{fmtBytes(usage.usedBytes)} / {fmtBytes(usage.quotaBytes)}</Text>
          </Group>
          <Progress value={usedPct} color={usedColor} size="xs" radius="xl" />
        </Box>
      )}

      <Breadcrumbs separator="/" fz="sm">
        <Anchor size="sm" onClick={() => setPrefix('')} c={prefix ? 'blue' : 'dimmed'}>root</Anchor>
        {breadcrumbs.map((seg, i) => {
          const pathTo = breadcrumbs.slice(0, i + 1).join('/')
          return (
            <Anchor key={pathTo} size="sm" onClick={() => setPrefix(pathTo)}
              c={i === breadcrumbs.length - 1 ? 'dimmed' : 'blue'}>{seg}</Anchor>
          )
        })}
      </Breadcrumbs>

      {isLoading ? (
        <Stack gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} h={36} radius="md" />)}</Stack>
      ) : (
        <Stack gap={4}>
          {data?.folders.map((folder) => {
            const folderPath = prefix ? `${prefix}/${folder}` : folder
            return (
              <Group key={folderPath} px="sm" py={6}
                style={{ borderRadius: 6, cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)' }}
                onClick={() => setPrefix(folderPath)}>
                <TbFolder size={15} color="var(--mantine-color-yellow-5)" />
                <Text size="sm" style={{ flex: 1 }}>{folder}/</Text>
              </Group>
            )
          })}

          {data?.files.map((f) => (
            <StorageFileRow
              key={f.id} file={f} slug={slug} isOwner={isOwner}
              onTogglePublic={() => togglePublic(f.path, f.isPublic)}
              onDelete={() => handleDelete(f.path)}
            />
          ))}

          {!data?.folders.length && !data?.files.length && (
            <Text size="sm" c="dimmed" ta="center" py="xl">Storage kosong. Upload file pertama.</Text>
          )}
        </Stack>
      )}

      <Modal opened={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload File" size="md">
        <StorageUploadModal slug={slug} prefix={prefix} onSuccess={invalidate} onClose={() => setUploadOpen(false)} />
      </Modal>
    </Stack>
  )
}
