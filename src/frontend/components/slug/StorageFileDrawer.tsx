import { Code, Drawer, Group, Image, Loader, ScrollArea, Stack, Text, ThemeIcon } from '@mantine/core'
import { useEffect, useState } from 'react'
import { TbFile } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { isTextFile } from '@/frontend/lib/storage-format'

interface FileInfo { path: string; mimeType: string; isPublic: boolean }
interface Props { file: FileInfo; slug: string; opened: boolean; onClose: () => void }

function PreviewContent({ url, mimeType, path }: { url: string; mimeType: string; path: string }) {
  const [text, setText] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  const isImg = mimeType.startsWith('image/')
  const isVid = mimeType.startsWith('video/')
  const isAud = mimeType.startsWith('audio/')
  const isText = isTextFile(mimeType, path)

  useEffect(() => {
    if (!isText) return
    setFetching(true)
    fetch(url)
      .then((r) => r.text())
      .then((t) => { setText(t); setFetching(false) })
      .catch(() => { setText('Gagal memuat konten'); setFetching(false) })
  }, [url, isText])

  if (isImg) return <Image src={url} fit="contain" mah={520} radius="md" />
  if (isVid) return <video src={url} controls style={{ width: '100%', maxHeight: 420, borderRadius: 8 }} />
  if (isAud) return <audio src={url} controls style={{ width: '100%' }} />
  if (isText) {
    if (fetching) return <Loader size="sm" />
    return (
      <ScrollArea h={480}>
        <Code block fz="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text ?? ''}</Code>
      </ScrollArea>
    )
  }
  return (
    <Text c="dimmed" ta="center" py="xl" size="sm">
      Format ini tidak bisa dipreview secara langsung.<br />Gunakan tombol download.
    </Text>
  )
}

export function StorageFileDrawer({ file, slug, opened, onClose }: Props) {
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) { setPresignedUrl(null); setErr(null); return }
    setLoading(true)
    apiFetch<{ url: string }>(`/api/envman/projects/${slug}/storage/download?path=${encodeURIComponent(file.path)}`)
      .then((res) => { setPresignedUrl(res?.url ?? null); setLoading(false) })
      .catch((e) => { setErr((e as Error).message); setLoading(false) })
  }, [opened, slug, file.path])

  const name = file.path.split('/').pop()

  return (
    <Drawer
      opened={opened} onClose={onClose} position="right" size="lg"
      title={
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="teal"><TbFile size={12} /></ThemeIcon>
          <Text size="sm" fw={500} style={{ wordBreak: 'break-all' }}>{name}</Text>
          {file.isPublic && <Text size="xs" c="green">(publik)</Text>}
        </Group>
      }
    >
      <Stack gap="md" p="xs">
        {loading && <Loader size="sm" />}
        {err && <Text c="red" size="sm">{err}</Text>}
        {presignedUrl && <PreviewContent url={presignedUrl} mimeType={file.mimeType} path={file.path} />}
      </Stack>
    </Drawer>
  )
}
