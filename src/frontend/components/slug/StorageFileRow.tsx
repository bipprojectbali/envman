import { ActionIcon, Badge, Box, Checkbox, Group, Modal, Stack, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbCheck, TbCopy, TbDownload, TbEye, TbEyeOff, TbFileSearch, TbPencil, TbShare2, TbTrash } from 'react-icons/tb'
import { useStorageFileActions } from '@/frontend/hooks/useStorageFileActions'
import { fmtBytes, getFileIcon } from '@/frontend/lib/storage-format'
import { StorageFileDrawer } from './StorageFileDrawer'
import { StorageRenameModal } from './StorageRenameModal'

interface StorageObject {
  id: string; path: string; size: number; mimeType: string
  isPublic: boolean; tags: string[]; description: string | null
}
interface Props {
  file: StorageObject; slug: string; isOwner: boolean; canEdit: boolean
  selected?: boolean; selectionMode?: boolean; onSelect?: (path: string) => void
  onTogglePublic: () => void; onDelete: () => void; onRename: () => void
}

export function StorageFileRow({ file, slug, isOwner, canEdit, selected, selectionMode, onSelect, onTogglePublic, onDelete, onRename }: Props) {
  const { copied, previewOpen, setPreviewOpen, handleShare, handleCopyContent, handleDownload,
    handleDragStart, prefetchPresigned, canPreview, canCopy } = useStorageFileActions(file, slug)
  const [renameOpen, setRenameOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const showCheckbox = !!selected || !!selectionMode || hovered

  const name = file.path.split('/').pop()
  const ext = name?.includes('.') ? name.split('.').pop()?.toUpperCase() : null
  const FileIcon = getFileIcon(file.mimeType, file.path)

  return (
    <>
      <Group px="sm" py={6}
        draggable={!selected} onDragStart={selected ? undefined : handleDragStart}
        onMouseEnter={() => { setHovered(true); prefetchPresigned() }}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: 6,
          border: selected
            ? '1px solid var(--mantine-color-blue-5)'
            : '1px solid var(--mantine-color-default-border)',
          background: selected ? 'var(--mantine-color-blue-light)' : undefined,
          cursor: selected ? 'default' : 'grab',
        }}
        wrap="nowrap">
        {onSelect && (
          <Box style={{ width: 20, flexShrink: 0, opacity: showCheckbox ? 1 : 0, transition: 'opacity 0.12s' }}>
            <Checkbox size="xs" checked={!!selected} onChange={() => onSelect(file.path)}
              onClick={(e) => e.stopPropagation()} />
          </Box>
        )}
        <FileIcon size={15} style={{ flexShrink: 0 }} />
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Text>
          <Group gap="xs">
            <Text size="xs" c="dimmed">{fmtBytes(file.size)}</Text>
            {ext && <Badge size="xs" variant="dot" color="gray">{ext}</Badge>}
            {file.isPublic && <Badge size="xs" variant="light" color="green">publik</Badge>}
          </Group>
        </Stack>

        <Group gap={4} wrap="nowrap">
          <Tooltip label={copied === 'link' ? 'Disalin!' : file.isPublic ? 'Salin link publik' : 'Salin link (5 mnt)'}>
            <ActionIcon size="sm" variant="subtle" color={copied === 'link' ? 'green' : 'gray'} onClick={handleShare}>
              {copied === 'link' ? <TbCheck size={13} /> : <TbShare2 size={13} />}
            </ActionIcon>
          </Tooltip>

          {canPreview && (
            <Tooltip label="Preview">
              <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setPreviewOpen(true)}>
                <TbFileSearch size={13} />
              </ActionIcon>
            </Tooltip>
          )}

          {canCopy && (
            <Tooltip label={copied === 'content' ? 'Disalin!' : 'Salin konten'}>
              <ActionIcon size="sm" variant="subtle" color={copied === 'content' ? 'green' : 'gray'} onClick={handleCopyContent}>
                {copied === 'content' ? <TbCheck size={13} /> : <TbCopy size={13} />}
              </ActionIcon>
            </Tooltip>
          )}

          <Tooltip label="Download">
            <ActionIcon size="sm" variant="subtle" onClick={handleDownload}><TbDownload size={13} /></ActionIcon>
          </Tooltip>

          {canEdit && (
            <Tooltip label="Rename">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRenameOpen(true)}>
                <TbPencil size={13} />
              </ActionIcon>
            </Tooltip>
          )}

          {isOwner && (
            <Tooltip label={file.isPublic ? 'Set private' : 'Set publik'}>
              <ActionIcon size="sm" variant="subtle" color={file.isPublic ? 'green' : 'gray'} onClick={onTogglePublic}>
                {file.isPublic ? <TbEye size={13} /> : <TbEyeOff size={13} />}
              </ActionIcon>
            </Tooltip>
          )}

          {isOwner && (
            <Tooltip label="Hapus">
              <ActionIcon size="sm" variant="subtle" color="red" onClick={onDelete}><TbTrash size={13} /></ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      <StorageFileDrawer file={file} slug={slug} opened={previewOpen} onClose={() => setPreviewOpen(false)} />

      <Modal opened={renameOpen} onClose={() => setRenameOpen(false)} title="Rename File" size="sm">
        <StorageRenameModal slug={slug} file={file} onSuccess={onRename} onClose={() => setRenameOpen(false)} />
      </Modal>
    </>
  )
}
