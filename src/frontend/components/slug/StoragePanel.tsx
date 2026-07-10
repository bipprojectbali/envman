import {
  ActionIcon, Alert, Anchor, Box, Breadcrumbs, Button, Group, Modal,
  Progress, Skeleton, Stack, Text, ThemeIcon, Tooltip,
} from '@mantine/core'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { TbChevronLeft, TbChevronRight, TbCloudUpload, TbFile, TbFolder, TbFolderPlus, TbFolderSymlink, TbInfoCircle, TbLayoutGrid, TbList, TbSettings, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { collectFilesFromEntry, filesFromInput, type CollectedFile } from '@/frontend/lib/folder-upload-utils'
import { fmtBytes } from '@/frontend/lib/storage-format'
import { StorageFileGrid } from './StorageFileCard'
import { StorageFileRow } from './StorageFileRow'
import { StorageFolderUploadModal } from './StorageFolderUploadModal'
import { StorageMoveModal } from './StorageMoveModal'
import { StorageSettingsModal } from './StorageSettingsModal'
import { StorageUploadModal } from './StorageUploadModal'

interface StorageObject {
  id: string; path: string; size: number; mimeType: string
  isPublic: boolean; tags: string[]; description: string | null
  createdAt: string; updatedAt: string
}
interface StorageData {
  prefix: string; folders: string[]; files: StorageObject[]
  usage: { usedBytes: number; quotaBytes: number }
  totalFiles: number; page: number; pageSize: number
}

interface Props { slug: string; isOwner: boolean; canEdit: boolean; isSuperAdmin?: boolean }

export function StoragePanel({ slug, isOwner, canEdit, isSuperAdmin }: Props) {
  const [prefix, setPrefix] = useState('')
  const [page, setPage] = useState(1)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [folderUploadOpen, setFolderUploadOpen] = useState(false)
  const [folderDropped, setFolderDropped] = useState<CollectedFile[]>([])
  const [storageSettingsOpen, setStorageSettingsOpen] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('storage:viewMode') as 'list' | 'grid') ?? 'list'
  )
  const qc = useQueryClient()

  const selectionMode = selectedPaths.size > 0

  // Reset ke halaman 1 dan hapus seleksi setiap kali prefix berubah
  useEffect(() => { setPage(1); setSelectedPaths(new Set()) }, [prefix])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['storage', slug, prefix] })
    // Segarkan badge count/size di tab Storage (storageStats ada di project detail).
    qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
  }

  function toggleSelect(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function selectAll() { setSelectedPaths(new Set(data?.files.map((f) => f.path) ?? [])) }
  function clearSelection() { setSelectedPaths(new Set()) }

  async function handleBulkDelete() {
    if (!confirm(`Hapus ${selectedPaths.size} file? Tindakan ini tidak bisa dibatalkan.`)) return
    for (const path of Array.from(selectedPaths)) {
      await fetch(`/api/envman/projects/${slug}/storage?path=${encodeURIComponent(path)}`, {
        method: 'DELETE', credentials: 'include',
      })
    }
    clearSelection()
    invalidate()
  }

  const { data, isLoading } = useQuery<StorageData>({
    queryKey: ['storage', slug, prefix, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (prefix) params.set('prefix', prefix)
      params.set('page', String(page))
      return apiFetch(`/api/envman/projects/${slug}/storage?${params}`)
    },
    staleTime: 30_000,
  })

  const breadcrumbs = prefix ? prefix.split('/') : []

  function navigatePrefix(p: string) { setPrefix(p); setPage(1) }

  async function handleDeleteFolder(folderPath: string) {
    if (!confirm(`Hapus folder "${folderPath}/" dan semua isinya? Tindakan ini tidak bisa dibatalkan.`)) return
    await fetch(`/api/envman/projects/${slug}/storage/folder?prefix=${encodeURIComponent(folderPath)}`, {
      method: 'DELETE', credentials: 'include',
    })
    invalidate()
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ path, isPublic: !isPublic }),
    })
    invalidate()
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (!canEdit || !e.dataTransfer.types.includes('Files')) return
    setIsDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    // Hanya reset jika drag benar-benar keluar dari Box — bukan pindah ke child.
    // e.relatedTarget = elemen yang dimasuki drag; null = keluar ke luar browser/OS.
    if ((e.currentTarget as Element).contains(e.relatedTarget as Node | null)) return
    setIsDragOver(false)
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (!canEdit) return
    const items = Array.from(e.dataTransfer.items)
    const entry = items[0]?.webkitGetAsEntry?.()
    if (entry?.isDirectory) {
      const collected = await collectFilesFromEntry(entry as FileSystemDirectoryEntry, '')
      if (collected.length > 0) { setFolderDropped(collected); setFolderUploadOpen(true) }
      return
    }
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) { setDroppedFile(files[0]); setUploadOpen(true) }
  }

  function toggleView() {
    const next = viewMode === 'list' ? 'grid' : 'list'
    setViewMode(next); localStorage.setItem('storage:viewMode', next)
  }

  function closeModal() { setUploadOpen(false); setDroppedFile(null) }

  const usage = data?.usage
  const usedPct = usage ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100) : 0
  const usedColor = usedPct > 90 ? 'red' : usedPct > 70 ? 'yellow' : 'blue'
  const totalPages = data ? Math.max(1, Math.ceil(data.totalFiles / data.pageSize)) : 1
  const isEmpty = !data?.folders.length && !data?.files.length
  const allExistingPaths = data?.files.map((f) => f.path)

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs">
          <ThemeIcon size={22} radius="md" variant="light" color="teal"><TbFile size={13} /></ThemeIcon>
          <Text size="sm" fw={600}>Storage</Text>
        </Group>
        <Group gap={4}>
          <Tooltip label={viewMode === 'list' ? 'Tampilan grid' : 'Tampilan list'}>
            <Button size="xs" variant="subtle" color="gray" px={6} onClick={toggleView}>
              {viewMode === 'list' ? <TbLayoutGrid size={14} /> : <TbList size={14} />}
            </Button>
          </Tooltip>
          {isSuperAdmin && (
            <Tooltip label="Atur batas storage project">
              <Button size="xs" variant="subtle" color="gray" px={6} onClick={() => setStorageSettingsOpen(true)}>
                <TbSettings size={14} />
              </Button>
            </Tooltip>
          )}
          {canEdit && (
            <>
              <Button size="xs" variant="light" leftSection={<TbCloudUpload size={13} />} onClick={() => setUploadOpen(true)}>
                Upload
              </Button>
              <Tooltip label="Upload folder">
                <Button size="xs" variant="light" color="teal" px={6} onClick={() => folderInputRef.current?.click()}>
                  <TbFolderPlus size={14} />
                </Button>
              </Tooltip>
              <input ref={folderInputRef} type="file" style={{ display: 'none' }}
                // @ts-expect-error -- webkitdirectory is not in React types but supported in all major browsers
                webkitdirectory=""
                onChange={(e) => {
                  const collected = filesFromInput(Array.from(e.target.files ?? []))
                  if (collected.length > 0) { setFolderDropped(collected); setFolderUploadOpen(true) }
                  e.target.value = ''
                }} />
            </>
          )}
        </Group>
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

      <Alert variant="light" color="teal" radius="md" p="xs" icon={<TbInfoCircle size={15} />}
        styles={{ message: { fontSize: 'var(--mantine-font-size-xs)' }, body: { gap: 4 } }}>
        <Stack gap={4}>
          <Text size="xs">
            Simpan file per project — gambar, konfigurasi, skrip, dokumen, dsb. Upload via tombol, drag-drop ke panel, atau paste dari clipboard (Ctrl+V / ⌘V).
          </Text>
          <Text size="xs" c="dimmed">
            Pilih banyak file sekaligus dengan checkbox untuk batch pindah atau hapus. Klik file untuk preview. Toggle list/grid via ikon kanan atas. File <strong>isPublic</strong> dapat diakses tanpa login.
          </Text>
          <Text size="xs" c="dimmed">
            CLI: <code>envman storage ls {slug}</code> · <code>envman storage upload {slug} file.txt</code> · <code>envman storage download {slug}:path | bash</code>
          </Text>
        </Stack>
      </Alert>

      <Breadcrumbs separator="/" fz="sm">
        <Anchor size="sm" onClick={() => navigatePrefix('')} c={prefix ? 'blue' : 'dimmed'}>root</Anchor>
        {breadcrumbs.map((seg, i) => {
          const pathTo = breadcrumbs.slice(0, i + 1).join('/')
          return (
            <Anchor key={pathTo} size="sm" onClick={() => navigatePrefix(pathTo)}
              c={i === breadcrumbs.length - 1 ? 'dimmed' : 'blue'}>{seg}</Anchor>
          )
        })}
      </Breadcrumbs>

      {/* Action bar seleksi */}
      {selectionMode && (
        <Group px="sm" py={8} style={{ borderRadius: 8, background: 'var(--mantine-color-blue-light)',
          border: '1px solid var(--mantine-color-blue-3)' }}>
          <Text size="sm" fw={500} c="blue">{selectedPaths.size} dipilih</Text>
          <Button size="xs" variant="subtle" c="blue" onClick={selectAll}>Pilih semua</Button>
          <Group gap={6} ml="auto">
            {canEdit && (
              <Button size="xs" variant="light" color="blue" leftSection={<TbFolderSymlink size={13} />}
                onClick={() => setMoveOpen(true)}>Pindah</Button>
            )}
            {isOwner && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />}
                onClick={handleBulkDelete}>Hapus</Button>
            )}
            <Button size="xs" variant="subtle" color="gray" onClick={clearSelection}>Batalkan</Button>
          </Group>
        </Group>
      )}

      <Box style={{ position: 'relative' }}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
        onDragOver={handleDragOver} onDrop={handleDrop}>

        {isDragOver && canEdit && (
          <Box style={{ position: 'absolute', inset: -8, zIndex: 50, borderRadius: 8,
            border: '2px dashed var(--mantine-color-blue-5)',
            background: 'var(--mantine-color-blue-light-hover)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <Text size="md" fw={600} c="blue">Drop file atau folder untuk upload</Text>
          </Box>
        )}

        {isLoading ? (
          <Stack gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} h={36} radius="md" />)}</Stack>
        ) : viewMode === 'grid' ? (
          <>
            {isEmpty ? (
              <Text size="sm" c="dimmed" ta="center" py="xl">Storage kosong. Upload file pertama.</Text>
            ) : (
              <StorageFileGrid slug={slug} isOwner={isOwner} canEdit={canEdit}
                folders={data?.folders ?? []} files={data?.files ?? []} prefix={prefix}
                selected={selectedPaths} selectionMode={selectionMode} onSelect={toggleSelect}
                onFolderClick={navigatePrefix} onDeleteFolder={isOwner ? handleDeleteFolder : undefined}
                onTogglePublic={togglePublic} onDelete={handleDelete} onRename={invalidate} />
            )}
          </>
        ) : (
          <Stack gap={4}>
            {data?.folders.map((folder) => {
              const folderPath = prefix ? `${prefix}/${folder}` : folder
              return (
                <Group key={folderPath} px="sm" py={6}
                  style={{ borderRadius: 6, cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)' }}
                  onClick={() => navigatePrefix(folderPath)}>
                  <TbFolder size={15} color="var(--mantine-color-yellow-5)" />
                  <Text size="sm" style={{ flex: 1 }}>{folder}/</Text>
                  {isOwner && (
                    <Tooltip label="Hapus folder">
                      <ActionIcon size="sm" variant="subtle" color="red"
                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folderPath) }}>
                        <TbTrash size={13} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              )
            })}
            {data?.files.map((f) => (
              <StorageFileRow key={f.id} file={f} slug={slug} isOwner={isOwner} canEdit={canEdit}
                selected={selectedPaths.has(f.path)} selectionMode={selectionMode} onSelect={toggleSelect}
                onTogglePublic={() => togglePublic(f.path, f.isPublic)}
                onDelete={() => handleDelete(f.path)}
                onRename={invalidate} />
            ))}
            {isEmpty && (
              <Text size="sm" c="dimmed" ta="center" py="xl">Storage kosong. Upload file pertama.</Text>
            )}
          </Stack>
        )}
      </Box>

      {/* Pagination — hanya tampil jika ada >1 halaman */}
      {totalPages > 1 && (
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {(page - 1) * (data?.pageSize ?? 50) + 1}–{Math.min(page * (data?.pageSize ?? 50), data?.totalFiles ?? 0)} dari {data?.totalFiles} file
          </Text>
          <Group gap={4}>
            <Button size="xs" variant="subtle" px={6} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <TbChevronLeft size={14} />
            </Button>
            <Text size="xs" c="dimmed">{page} / {totalPages}</Text>
            <Button size="xs" variant="subtle" px={6} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <TbChevronRight size={14} />
            </Button>
          </Group>
        </Group>
      )}

      <Modal opened={uploadOpen} onClose={closeModal} title="Upload File" size="md">
        <StorageUploadModal slug={slug} prefix={prefix} defaultFile={droppedFile ?? undefined}
          existingPaths={allExistingPaths}
          onSuccess={invalidate} onClose={closeModal} />
      </Modal>

      <Modal opened={folderUploadOpen} onClose={() => setFolderUploadOpen(false)} title="Upload Folder" size="md">
        <StorageFolderUploadModal slug={slug} prefix={prefix} files={folderDropped}
          onSuccess={invalidate} onClose={() => setFolderUploadOpen(false)} />
      </Modal>

      <Modal opened={moveOpen} onClose={() => setMoveOpen(false)} title="Pindah File" size="sm">
        <StorageMoveModal
          slug={slug} currentPrefix={prefix}
          selectedPaths={Array.from(selectedPaths)}
          onSuccess={() => { clearSelection(); invalidate() }}
          onClose={() => setMoveOpen(false)} />
      </Modal>

      <StorageSettingsModal slug={slug} opened={storageSettingsOpen} onClose={() => setStorageSettingsOpen(false)} />
    </Stack>
  )
}
