import { Badge, Box, Button, Group, Progress, ScrollArea, Stack, Text, ThemeIcon } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { TbCheck, TbCloudUpload, TbLoader2, TbX } from 'react-icons/tb'
import type { CollectedFile } from '@/frontend/lib/folder-upload-utils'
import { fmtBytes } from '@/frontend/lib/storage-format'

interface Props {
  slug: string
  prefix: string
  files: CollectedFile[]
  onSuccess: () => void
  onClose: () => void
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

function uploadOne(
  slug: string,
  remotePath: string,
  item: CollectedFile,
  onProgress: (pct: number) => void,
  abortRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('file', item.file)
    fd.append('path', remotePath)
    const xhr = new XMLHttpRequest()
    abortRef.current = () => xhr.abort()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return }
      try {
        const j = JSON.parse(xhr.responseText)
        reject(new Error(j.error ?? `HTTP ${xhr.status}`))
      } catch { reject(new Error(`HTTP ${xhr.status}`)) }
    })
    xhr.addEventListener('error', () => reject(new Error('Koneksi gagal')))
    xhr.addEventListener('abort', () => reject(new Error('Dibatalkan')))
    xhr.open('POST', `/api/envman/projects/${encodeURIComponent(slug)}/storage/upload`)
    xhr.withCredentials = true
    xhr.send(fd)
  })
}

export function StorageFolderUploadModal({ slug, prefix, files, onSuccess, onClose }: Props) {
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>(() =>
    Object.fromEntries(files.map((f) => [f.path, 'pending' as FileStatus]))
  )
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [fileProgress, setFileProgress] = useState<number | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [finished, setFinished] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const doneCount = Object.values(statuses).filter((s) => s === 'done').length
  const totalCount = files.length
  const overallPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  useEffect(() => {
    let cancelled = false

    async function run() {
      for (let i = 0; i < files.length; i++) {
        if (cancelled) break
        const item = files[i]
        const remotePath = prefix ? `${prefix}/${item.path}` : item.path
        setCurrentIndex(i)
        setFileProgress(0)
        setStatuses((prev) => ({ ...prev, [item.path]: 'uploading' }))
        try {
          await uploadOne(slug, remotePath, item, setFileProgress, abortRef)
          setStatuses((prev) => ({ ...prev, [item.path]: 'done' }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg === 'Dibatalkan') { cancelled = true; break }
          setStatuses((prev) => ({ ...prev, [item.path]: 'error' }))
          setErrors((prev) => [...prev, `${item.path}: ${msg}`])
        }
        setFileProgress(null)
      }
      setFinished(true)
      if (!cancelled) onSuccess()
    }

    run()
    return () => { cancelled = true; abortRef.current?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentFile = currentIndex >= 0 && currentIndex < files.length ? files[currentIndex] : null

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={500}>{totalCount} file</Text>
        <Badge color={errors.length > 0 ? 'orange' : 'teal'} variant="light">
          {doneCount}/{totalCount} selesai
        </Badge>
      </Group>

      <Progress value={overallPct} size="sm" radius="xl" color={errors.length > 0 ? 'orange' : 'teal'} />

      {currentFile && !finished && (
        <Box>
          <Text size="xs" c="dimmed" mb={4}>
            Mengupload: {currentFile.path} ({fmtBytes(currentFile.file.size)})
          </Text>
          <Progress value={fileProgress ?? 0} size="xs" animated />
        </Box>
      )}

      <ScrollArea mah={280} type="auto">
        <Stack gap={2}>
          {files.map((f) => {
            const status = statuses[f.path] ?? 'pending'
            return (
              <Group key={f.path} gap="xs" py={4} px="xs" style={{
                borderRadius: 6,
                background: status === 'error' ? 'var(--mantine-color-red-light)' : undefined,
              }}>
                <ThemeIcon size={18} radius="sm" variant="light"
                  color={status === 'done' ? 'teal' : status === 'error' ? 'red' : status === 'uploading' ? 'blue' : 'gray'}>
                  {status === 'done' ? <TbCheck size={11} /> :
                   status === 'error' ? <TbX size={11} /> :
                   status === 'uploading' ? <TbLoader2 size={11} /> :
                   <TbCloudUpload size={11} />}
                </ThemeIcon>
                <Text size="xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.path}
                </Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{fmtBytes(f.file.size)}</Text>
              </Group>
            )
          })}
        </Stack>
      </ScrollArea>

      {errors.length > 0 && (
        <Text size="xs" c="orange">Gagal: {errors.length} file — lihat status di atas</Text>
      )}

      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose}>
          {finished ? 'Tutup' : 'Batalkan'}
        </Button>
      </Group>
    </Stack>
  )
}
