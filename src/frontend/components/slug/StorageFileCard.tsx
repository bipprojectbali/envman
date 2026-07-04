import { ActionIcon, Badge, Card, Group, Image, SimpleGrid, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbCheck, TbCopy, TbDownload, TbEye, TbEyeOff, TbFile, TbFileSearch, TbFolder, TbShare2, TbTrash } from 'react-icons/tb'
import { useStorageFileActions } from '@/frontend/hooks/useStorageFileActions'
import { fmtBytes } from '@/frontend/lib/storage-format'
import { StorageFileDrawer } from './StorageFileDrawer'

interface StorageObject {
  id: string; path: string; size: number; mimeType: string
  isPublic: boolean; tags: string[]; description: string | null
}
interface FileCardProps {
  file: StorageObject; slug: string; isOwner: boolean
  onTogglePublic: () => void; onDelete: () => void
}
interface FolderCardProps {
  name: string; onClick: () => void
}
interface GridProps {
  slug: string; isOwner: boolean; folders: string[]; files: StorageObject[]; prefix: string
  onFolderClick: (path: string) => void
  onTogglePublic: (path: string, isPublic: boolean) => void
  onDelete: (path: string) => void
}

function FileCard({ file, slug, isOwner, onTogglePublic, onDelete }: FileCardProps) {
  const { copied, previewOpen, setPreviewOpen, handleShare, handleCopyContent, handleDownload,
    handleDragStart, prefetchPresigned, canPreview, canCopy } = useStorageFileActions(file, slug)

  const name = file.path.split('/').pop() ?? file.path
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : null
  const isImg = file.mimeType.startsWith('image/')
  const publicThumb = file.isPublic && isImg ? `/api/public/storage/${slug}/${file.path}` : null

  return (
    <>
      <Card withBorder padding="sm" radius="md" draggable onDragStart={handleDragStart} onMouseEnter={prefetchPresigned}
        style={{ cursor: 'grab' }}>
        <Card.Section onClick={canPreview ? () => setPreviewOpen(true) : undefined}
          style={{ cursor: canPreview ? 'pointer' : undefined, display: 'flex', alignItems: 'center',
            justifyContent: 'center', height: 90,
            background: 'var(--mantine-color-default-hover)', overflow: 'hidden' }}>
          {publicThumb ? (
            <Image src={publicThumb} h={90} fit="cover" />
          ) : (
            <ThemeIcon size={36} variant="light" color="gray" radius="xl"><TbFile size={18} /></ThemeIcon>
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

export function StorageFileGrid({ slug, isOwner, folders, files, prefix, onFolderClick, onTogglePublic, onDelete }: GridProps) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
      {folders.map((folder) => {
        const folderPath = prefix ? `${prefix}/${folder}` : folder
        return <FolderCard key={folderPath} name={folder} onClick={() => onFolderClick(folderPath)} />
      })}
      {files.map((f) => (
        <FileCard key={f.id} file={f} slug={slug} isOwner={isOwner}
          onTogglePublic={() => onTogglePublic(f.path, f.isPublic)}
          onDelete={() => onDelete(f.path)} />
      ))}
    </SimpleGrid>
  )
}
