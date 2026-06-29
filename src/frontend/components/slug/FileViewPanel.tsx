import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  CopyButton,
  Divider,
  Group,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from '@mantine/core'
import { TbCheck, TbChevronLeft, TbChevronRight, TbCopy, TbEdit, TbFileCode } from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { getLangColor } from '@/frontend/lib/languages'
import { relTime } from './FileCard'
import type { ProjectFile } from './FileForm'

interface FileViewPanelProps {
  viewingFile: ProjectFile | null
  isLoading: boolean
  activeViewTab: number
  onActiveViewTabChange: (i: number) => void
  onClose: () => void
  onEdit: (f: ProjectFile) => void
  canManage: (authorId: string) => boolean
}

export function FileViewPanel({
  viewingFile, isLoading, activeViewTab, onActiveViewTabChange, onClose, onEdit, canManage,
}: FileViewPanelProps) {
  const currentViewFile = viewingFile?.files[activeViewTab] ?? viewingFile?.files[0]

  return (
    <Stack gap="lg">
      <Group gap={6} align="center">
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose}><TbChevronLeft size={15} /></ActionIcon>
        <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onClose}>Files</Anchor>
        <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        <Text size="sm" fw={600} lineClamp={1}>{viewingFile?.title ?? '...'}</Text>
      </Group>
      <Divider />
      {isLoading && <Skeleton height={300} radius="md" />}
      {!isLoading && !viewingFile && <Text size="sm" c="dimmed">File tidak ditemukan.</Text>}
      {viewingFile && (
        <Stack gap="sm">
          {viewingFile.description && <Text size="sm" c="dimmed">{viewingFile.description}</Text>}
          <Tabs value={String(activeViewTab)} onChange={(v) => onActiveViewTabChange(Number(v))} variant="outline">
            <Tabs.List>
              {viewingFile.files.map((f, i) => (
                <Tabs.Tab key={f.filename} value={String(i)} leftSection={<TbFileCode size={12} />}>
                  <Group gap={4}><Text size="xs">{f.filename}</Text><Badge size="xs" variant="dot" color={getLangColor(f.language)}>{f.language}</Badge></Group>
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {viewingFile.files.map((f, i) => (
              <Tabs.Panel key={f.filename} value={String(i)} pt="xs">
                <Box p="md" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', maxHeight: 500, overflowY: 'auto' }}>
                  <MarkdownRenderer fontSize={13}>
                    {f.language === 'markdown' ? f.content || '_Kosong_' : `\`\`\`${f.language}\n${f.content || ''}\n\`\`\``}
                  </MarkdownRenderer>
                </Box>
              </Tabs.Panel>
            ))}
          </Tabs>
          <Group gap={4} wrap="wrap">
            {viewingFile.tags.map((t) => <Badge key={t} size="xs" variant="outline" color="gray">{t}</Badge>)}
            <Text size="xs" c="dimmed" ml="auto">oleh {viewingFile.author.name} · {relTime(viewingFile.updatedAt)}</Text>
          </Group>
          <Divider />
          <Group justify="space-between">
            <CopyButton value={currentViewFile?.content ?? ''} timeout={2000}>
              {({ copied, copy }) => (
                <Button type="button" size="xs" variant="subtle" color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />} onClick={copy}>
                  {copied ? 'Tersalin!' : `Copy ${currentViewFile?.filename ?? ''}`}
                </Button>
              )}
            </CopyButton>
            {canManage(viewingFile.author.id) && (
              <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={() => onEdit(viewingFile)}>Edit</Button>
            )}
          </Group>
        </Stack>
      )}
    </Stack>
  )
}
