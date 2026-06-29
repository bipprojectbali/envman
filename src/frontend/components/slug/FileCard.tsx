import {
  ActionIcon,
  Badge,
  Box,
  Code,
  CopyButton,
  Group,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbCheck,
  TbCopy,
  TbEdit,
  TbFiles,
  TbTrash,
} from 'react-icons/tb'
import { getLangColor } from '@/frontend/lib/languages'
import type { ProjectFile } from './FileForm'

export const HOVER_STYLES = `
.envman-file-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-file-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-blue-5);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-file-card:focus-visible {
  outline: 2px solid var(--mantine-color-blue-5);
  outline-offset: 2px;
}
`

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}h lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function absoluteTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface FileCardProps {
  file: ProjectFile
  slug: string
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  onTagClick?: (tag: string) => void
}

export function FileCard({ file, slug, canManage, onEdit, onDelete, onView, onTagClick }: FileCardProps) {
  const firstFile = file.files[0]
  return (
    <Box
      p="sm"
      className="envman-file-card"
      role="article"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
    >
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={28} radius="sm" variant="light" color="blue"><TbFiles size={15} /></ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.title}</Text>
            {file.description && <Text size="xs" c="dimmed" lineClamp={1}>{file.description}</Text>}
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          <CopyButton value={file.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n')} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Tersalin!' : 'Salin semua file'} position="left">
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={(e) => { e.stopPropagation(); copy() }}>
                  {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          {canManage && (
            <>
              <Tooltip label="Edit" position="left">
                <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit() }}><TbEdit size={13} /></ActionIcon>
              </Tooltip>
              <Tooltip label="Hapus" position="left">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete() }}><TbTrash size={13} /></ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {file.prefix && (
        <Group gap={4} mb={6} wrap="wrap" align="center" onClick={(e) => e.stopPropagation()}>
          <Code fz="xs" c="dimmed">{slug}:{file.prefix}/…</Code>
          {file.files.map((f) => {
            const path = `${slug}:${file.prefix}/${f.filename}`
            return (
              <CopyButton key={f.filename} value={path} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Disalin!' : path} withArrow>
                    <Badge size="xs" variant={copied ? 'filled' : 'light'} color={copied ? 'teal' : getLangColor(f.language)}
                      style={{ cursor: 'pointer' }} rightSection={copied ? <TbCheck size={9} /> : <TbCopy size={9} />}
                      onClick={(e) => { e.stopPropagation(); copy() }}>
                      {f.filename}
                    </Badge>
                  </Tooltip>
                )}
              </CopyButton>
            )
          })}
        </Group>
      )}

      {firstFile && (
        <Code block style={{ fontSize: 11, maxHeight: 80, overflow: 'hidden', marginBottom: 6 }}>
          {firstFile.content.split('\n').slice(0, 4).join('\n') || '(kosong)'}
        </Code>
      )}

      <Group gap={4} wrap="wrap" align="center">
        {!file.prefix && file.files.slice(0, 3).map((f) => (
          <Tooltip key={f.filename} label={`${f.language} · ${f.content.split('\n').length} baris`}>
            <Badge size="xs" variant="dot" color={getLangColor(f.language)}>{f.filename}</Badge>
          </Tooltip>
        ))}
        {file.files.length > 3 && (
          <Tooltip label={file.files.slice(3).map((f) => f.filename).join(', ')}>
            <Badge size="xs" variant="default">+{file.files.length - 3}</Badge>
          </Tooltip>
        )}
        {file.tags.slice(0, 3).map((t) => (
          <Badge key={t} size="xs" variant="outline" color="gray" style={{ cursor: 'pointer' }}
            onClick={onTagClick ? (e) => { e.stopPropagation(); onTagClick(t) } : undefined}>
            {t}
          </Badge>
        ))}
        {file.tags.length > 3 && (
          <Tooltip label={file.tags.slice(3).join(', ')}><Text size="xs" c="dimmed">+{file.tags.length - 3}</Text></Tooltip>
        )}
        <Tooltip label={`Diperbarui ${absoluteTime(file.updatedAt)} oleh ${file.author.name}`}>
          <Text size="xs" c="dimmed" ml="auto">{file.author.name} · {relTime(file.updatedAt)}</Text>
        </Tooltip>
      </Group>
    </Box>
  )
}
