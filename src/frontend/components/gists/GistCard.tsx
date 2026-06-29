import {
  ActionIcon,
  Badge,
  Box,
  CopyButton,
  Group,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbBrandGithub,
  TbCheck,
  TbCopy,
  TbEdit,
  TbGlobe,
  TbLock,
  TbShare,
  TbTrash,
} from 'react-icons/tb'
import { getLangColor } from '@/frontend/lib/languages'
import { absoluteTime, relTime, type Gist } from './gist-types'

interface Props {
  gist: Gist
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  onTagClick?: (tag: string) => void
}

export function GistCard({ gist, isOwner, onEdit, onDelete, onView, onTagClick }: Props) {
  const firstFile = gist.files[0]
  return (
    <Paper
      p="sm"
      className="envman-gist-card"
      role="article"
      tabIndex={0}
      aria-label={`Buka gist ${gist.title}`}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView()
        }
      }}
      style={{ cursor: 'pointer', border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
    >
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={28} radius="sm" variant="light" color="primary">
            <TbBrandGithub size={16} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gist.title}
              </Text>
              <Tooltip label={gist.isPublic ? 'Public — semua user bisa lihat' : 'Private — hanya kamu yang bisa lihat'}>
                <Badge
                  size="xs"
                  variant="light"
                  color={gist.isPublic ? 'teal' : 'gray'}
                  leftSection={gist.isPublic ? <TbGlobe size={9} /> : <TbLock size={9} />}
                >
                  {gist.isPublic ? 'public' : 'private'}
                </Badge>
              </Tooltip>
            </Group>
            {gist.description && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {gist.description}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          <CopyButton value={gist.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n')} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Tersalin!' : 'Salin semua file'} position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  aria-label="Salin semua file gist"
                  onClick={(e) => { e.stopPropagation(); copy() }}
                >
                  {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          {gist.isPublic && (
            <CopyButton value={`${window.location.origin}/gists/${gist.id}`} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Link disalin!' : 'Salin public link'} position="left">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    aria-label="Salin public link"
                    onClick={(e) => { e.stopPropagation(); copy() }}
                  >
                    {copied ? <TbCheck size={13} /> : <TbShare size={13} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
          {isOwner && (
            <>
              <Tooltip label="Edit" position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
                  aria-label="Edit gist"
                  onClick={(e) => { e.stopPropagation(); onEdit() }}
                >
                  <TbEdit size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" position="left">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label="Hapus gist"
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                >
                  <TbTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {firstFile && (
        <Text lineClamp={4} style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
          {firstFile.content || '(kosong)'}
        </Text>
      )}

      <Group gap={4} wrap="wrap" align="center">
        {gist.files.slice(0, 3).map((f) => (
          <Tooltip key={f.filename} label={`${f.language} · ${f.content.split('\n').length} baris`}>
            <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
              {f.filename}
            </Badge>
          </Tooltip>
        ))}
        {gist.files.length > 3 && (
          <Tooltip label={gist.files.slice(3).map((f) => f.filename).join(', ')}>
            <Badge size="xs" variant="default">+{gist.files.length - 3}</Badge>
          </Tooltip>
        )}
        {gist.tags.slice(0, 3).map((t) => (
          <Badge
            key={t}
            size="xs"
            variant="outline"
            color="gray"
            className="envman-gist-tag"
            onClick={onTagClick ? (e) => { e.stopPropagation(); onTagClick(t) } : undefined}
          >
            {t}
          </Badge>
        ))}
        {gist.tags.length > 3 && (
          <Tooltip label={gist.tags.slice(3).join(', ')}>
            <Text size="xs" c="dimmed">+{gist.tags.length - 3}</Text>
          </Tooltip>
        )}
        <Tooltip label={`Diperbarui ${absoluteTime(gist.updatedAt)} oleh ${gist.user.name}`}>
          <Text size="xs" c="dimmed" ml="auto">
            {gist.user.name} · {relTime(gist.updatedAt)}
          </Text>
        </Tooltip>
      </Group>
    </Paper>
  )
}
