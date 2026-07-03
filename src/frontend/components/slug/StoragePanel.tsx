import {
  ActionIcon, Anchor, Badge, Box, Breadcrumbs, Button, Group, Modal,
  Progress, Skeleton, Stack, Text, ThemeIcon, Tooltip,
} from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbCloudUpload, TbDownload, TbEye, TbEyeOff, TbFile,
  TbFolder, TbTrash,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
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

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
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

  async function handleDownload(path: string) {
    const res = await apiFetch<{ url: string }>(`/api/envman/projects/${slug}/storage/download?path=${encodeURIComponent(path)}`)
    if (res?.url) window.open(res.url, '_blank')
  }

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
      {/* Header */}
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

      {/* Quota bar */}
      {usage && (
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">Storage terpakai</Text>
            <Text size="xs" c="dimmed">{fmtBytes(usage.usedBytes)} / {fmtBytes(usage.quotaBytes)}</Text>
          </Group>
          <Progress value={usedPct} color={usedColor} size="xs" radius="xl" />
        </Box>
      )}

      {/* Breadcrumb */}
      <Breadcrumbs separator="/" fz="sm">
        <Anchor size="sm" onClick={() => setPrefix('')} c={prefix ? 'blue' : 'dimmed'}>root</Anchor>
        {breadcrumbs.map((seg, i) => {
          const pathTo = breadcrumbs.slice(0, i + 1).join('/')
          return (
            <Anchor key={pathTo} size="sm" onClick={() => setPrefix(pathTo)}
              c={i === breadcrumbs.length - 1 ? 'dimmed' : 'blue'}>
              {seg}
            </Anchor>
          )
        })}
      </Breadcrumbs>

      {/* Content */}
      {isLoading ? (
        <Stack gap="xs">{[1,2,3].map(i => <Skeleton key={i} h={36} radius="md" />)}</Stack>
      ) : (
        <Stack gap={4}>
          {/* Folders */}
          {data?.folders.map(folder => {
            const folderPath = prefix ? `${prefix}/${folder}` : folder
            return (
              <Group key={folderPath} px="sm" py={6} style={{ borderRadius: 6, cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)' }}
                onClick={() => setPrefix(folderPath)}>
                <TbFolder size={15} color="var(--mantine-color-yellow-5)" />
                <Text size="sm" style={{ flex: 1 }}>{folder}/</Text>
              </Group>
            )
          })}

          {/* Files */}
          {data?.files.map(f => (
            <Group key={f.id} px="sm" py={6} style={{ borderRadius: 6, border: '1px solid var(--mantine-color-default-border)' }} wrap="nowrap">
              <TbFile size={15} />
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.path.split('/').pop()}
                </Text>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">{fmtBytes(f.size)}</Text>
                  <Badge size="xs" variant="dot" color="gray">{f.mimeType.split('/')[1] ?? f.mimeType}</Badge>
                  {f.isPublic && <Badge size="xs" variant="light" color="green">publik</Badge>}
                </Group>
              </Stack>
              <Group gap={4} wrap="nowrap">
                <Tooltip label="Download"><ActionIcon size="sm" variant="subtle" onClick={() => handleDownload(f.path)}><TbDownload size={13} /></ActionIcon></Tooltip>
                {isOwner && (
                  <Tooltip label={f.isPublic ? 'Set private' : 'Set publik'}>
                    <ActionIcon size="sm" variant="subtle" color={f.isPublic ? 'green' : 'gray'} onClick={() => togglePublic(f.path, f.isPublic)}>
                      {f.isPublic ? <TbEye size={13} /> : <TbEyeOff size={13} />}
                    </ActionIcon>
                  </Tooltip>
                )}
                {isOwner && (
                  <Tooltip label="Hapus"><ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDelete(f.path)}><TbTrash size={13} /></ActionIcon></Tooltip>
                )}
              </Group>
            </Group>
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
