import { ActionIcon, Badge, Box, Card, Checkbox, Group, Image, Modal, SimpleGrid, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { useEffect, useState } from 'react'
import { TbCheck, TbCopy, TbDownload, TbEye, TbEyeOff, TbFileSearch, TbFolder, TbPencil, TbShare2, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { useStorageFileActions } from '@/frontend/hooks/useStorageFileActions'
import { fmtBytes, getFileIcon } from '@/frontend/lib/storage-format'
import { StorageFileDrawer } from './StorageFileDrawer'
import { StorageRenameModal } from './StorageRenameModal'

interface StorageObject {
  id: string; path: string; size: number; mimeType: string
  isPublic: boolean; tags: string[]; description: string | null
}
interface FileCardProps {
  file: StorageObject; slug: string; isOwner: boolean; canEdit: boolean
  selected?: boolean; selectionMode?: boolean; onSelect?: (path: string) => void
  onTogglePublic: () => void; onDelete: () => void; onRename: () => void
}
interface FolderCardProps { name: string; onClick: () => void }
interface GridProps {
  slug: string; isOwner: boolean; canEdit: boolean; folders: string[]; files: StorageObject[]; prefix: string
  selected?: Set<string>; selectionMode?: boolean; onSelect?: (path: string) => void
  onFolderClick: (path: string) => void
  onTogglePublic: (path: string, isPublic: boolean) => void
  onDelete: (path: string) => void
  onRename: () => void
}

function FileCard({ file, slug, isOwner, canEdit, selected, selectionMode, onSelect, onTogglePublic, onDelete, onRename }: FileCardProps) {
  const { copied, previewOpen, setPreviewOpen, handleShare, handleCopyContent, handleDownload,
    handleDragStart, prefetchPresigned, setPresignedCache, canPreview, canCopy } = useStorageFileActions(file, slug)
  const [renameOpen, setRenameOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const showCheckbox = !!selected || !!selectionMode || hovered

  const name = file.path.split('/').pop() ?? file.path
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : null
  const isImg = file.mimeType.startsWith('image/')
  const FileIcon = getFileIcon(file.mimeType, file.path)

  // Thumbnail: publik pakai permanent URL langsung; privat fetch presigned saat mount
  const [thumbUrl, setThumbUrl] = useState<string | null>(
    file.isPublic && isImg ? `/api/public/storage/${slug}/${file.path}` : null
  )
  useEffect(() => {
    if (!isImg || file.isPublic || thumbUrl) return
    apiFetch<{ url: string }>(`/api/envman/projects/${slug}/storage/download?path=${encodeURIComponent(file.path)}`)
      .then((res) => {
        if (res?.url) {
          setThumbUrl(res.url)
          setPresignedCache(res.url) // warmup cache drag-to-download sekalian
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Card withBorder padding="sm" radius="md"
        draggable={!selected} onDragStart={selected ? undefined : handleDragStart}
        onMouseEnter={() => { setHovered(true); if (!selected) prefetchPresigned() }}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor: selected ? 'default' : 'grab',
          position: 'relative',
          outline: selected ? '2px solid var(--mantine-color-blue-5)' : undefined,
          outlineOffset: -2,
        }}>
        {onSelect && (
          <Box style={{ position: 'absolute', top: 6, left: 6, zIndex: 10,
            opacity: showCheckbox ? 1 : 0, transition: 'opacity 0.12s' }}>
            <Checkbox size="xs" checked={!!selected} onChange={() => onSelect(file.path)}
              onClick={(e) => e.stopPropagation()} />
          </Box>
        )}
        <Card.Section onClick={!selectionMode && canPreview ? () => setPreviewOpen(true) : undefined}
          style={{ cursor: canPreview ? 'pointer' : undefined, display: 'flex', alignItems: 'center',
            justifyContent: 'center', height: 90,
            background: 'var(--mantine-color-default-hover)', overflow: 'hidden' }}>
          {thumbUrl ? (
            <Image src={thumbUrl} h={90} fit="cover" />
          ) : (
            <ThemeIcon size={36} variant="light" color="gray" radius="xl">
              <FileIcon size={18} />
            </ThemeIcon>
          )}
        </Card.Section>

        <Stack gap={2} mt={8}>
          <Text size="xs" fw={500} lineClamp={2} title={name}>{name}</Text>
          <Group gap={4}>
            <Text size="xs" c="dimmed">{fmtBytes(file.size)}</Text>
            {ext && <Badge size="xs" variant="dot" color="gray">{ext}</Badge>}
            {file.isPublic && <Badge size="xs" variant="light" color="green">publik</Badge>}
          </Group>
        </Stack>

        <Group gap={2} mt={8} wrap="nowrap">
          <Tooltip label={copied === 'link' ? 'Disalin!' : 'Salin link'}>
            <ActionIcon size="xs" variant="subtle" color={copied === 'link' ? 'green' : 'gray'} onClick={handleShare}>
              {copied === 'link' ? <TbCheck size={11} /> : <TbShare2 size={11} />}
            </ActionIcon>
          </Tooltip>
          {canPreview && (
            <Tooltip label="Preview">
              <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => setPreviewOpen(true)}>
                <TbFileSearch size={11} />
              </ActionIcon>
            </Tooltip>
          )}
          {canCopy && (
            <Tooltip label={copied === 'content' ? 'Disalin!' : 'Salin konten'}>
              <ActionIcon size="xs" variant="subtle" color={copied === 'content' ? 'green' : 'gray'} onClick={handleCopyContent}>
                {copied === 'content' ? <TbCheck size={11} /> : <TbCopy size={11} />}
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Download">
            <ActionIcon size="xs" variant="subtle" onClick={handleDownload}><TbDownload size={11} /></ActionIcon>
          </Tooltip>
          {canEdit && (
            <Tooltip label="Rename">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setRenameOpen(true)}>
                <TbPencil size={11} />
              </ActionIcon>
            </Tooltip>
          )}
          {isOwner && (
            <Tooltip label={file.isPublic ? 'Set private' : 'Set publik'}>
              <ActionIcon size="xs" variant="subtle" color={file.isPublic ? 'green' : 'gray'} onClick={onTogglePublic}>
                {file.isPublic ? <TbEye size={11} /> : <TbEyeOff size={11} />}
              </ActionIcon>
            </Tooltip>
          )}
          {isOwner && (
            <Tooltip label="Hapus">
              <ActionIcon size="xs" variant="subtle" color="red" onClick={onDelete}><TbTrash size={11} /></ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Card>

      <StorageFileDrawer file={file} slug={slug} opened={previewOpen} onClose={() => setPreviewOpen(false)} />

      <Modal opened={renameOpen} onClose={() => setRenameOpen(false)} title="Rename File" size="sm">
        <StorageRenameModal slug={slug} file={file} onSuccess={onRename} onClose={() => setRenameOpen(false)} />
      </Modal>
    </>
  )
}

function FolderCard({ name, onClick }: FolderCardProps) {
  return (
    <Card withBorder padding="sm" radius="md" style={{ cursor: 'pointer' }} onClick={onClick}>
      <Card.Section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 90,
        background: 'var(--mantine-color-default-hover)' }}>
        <TbFolder size={36} color="var(--mantine-color-yellow-5)" />
      </Card.Section>
      <Text size="xs" fw={500} mt={8} lineClamp={2}>{name}/</Text>
    </Card>
  )
}

export function StorageFileGrid({ slug, isOwner, canEdit, folders, files, prefix, selected, selectionMode, onSelect, onFolderClick, onTogglePublic, onDelete, onRename }: GridProps) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
      {folders.map((folder) => {
        const folderPath = prefix ? `${prefix}/${folder}` : folder
        return <FolderCard key={folderPath} name={folder} onClick={() => onFolderClick(folderPath)} />
      })}
      {files.map((f) => (
        <FileCard key={f.id} file={f} slug={slug} isOwner={isOwner} canEdit={canEdit}
          selected={selected?.has(f.path)} selectionMode={selectionMode} onSelect={onSelect}
          onTogglePublic={() => onTogglePublic(f.path, f.isPublic)}
          onDelete={() => onDelete(f.path)}
          onRename={onRename} />
      ))}
    </SimpleGrid>
  )
}
