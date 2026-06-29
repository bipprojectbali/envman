import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core'
import { useState } from 'react'
import {
  TbArrowsMaximize,
  TbBrandGithub,
  TbCheck,
  TbChevronLeft,
  TbCopy,
  TbEdit,
  TbEye,
  TbFileCode,
  TbGlobe,
  TbLock,
  TbPlus,
} from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { getLangColor } from '@/frontend/lib/languages'
import { absoluteTime, relTime, type Gist, type GistFile } from './gist-types'

interface Props {
  gist: Gist
  onBack: () => void
  isOwner: boolean
  onEdit: () => void
}

export function GistDetailView({ gist, onBack, isOwner, onEdit }: Props) {
  const [activeFile, setActiveFile] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const file = gist.files[activeFile] ?? gist.files[0]

  const renderContent = (f: GistFile) =>
    f.language === 'markdown' ? f.content || '_Kosong_' : `\`\`\`${f.language}\n${f.content || ''}\n\`\`\``

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onBack}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Text size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onBack}>
            Gists
          </Text>
          <Text size="sm" c="dimmed">/</Text>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <TbBrandGithub size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
            <Text size="sm" fw={600} lineClamp={1}>
              {gist.title}
            </Text>
            <Badge
              size="xs"
              variant="light"
              color={gist.isPublic ? 'teal' : 'gray'}
              leftSection={gist.isPublic ? <TbGlobe size={10} /> : <TbLock size={10} />}
              style={{ flexShrink: 0 }}
            >
              {gist.isPublic ? 'Public' : 'Private'}
            </Badge>
          </Group>
        </Group>
        <Divider />

        {gist.description && (
          <Text size="sm" c="dimmed">
            {gist.description}
          </Text>
        )}

        <Tabs value={String(activeFile)} onChange={(v) => setActiveFile(Number(v))} variant="outline">
          <Tabs.List>
            {gist.files.map((f, i) => (
              <Tabs.Tab key={f.filename} value={String(i)} leftSection={<TbFileCode size={12} />}>
                <Group gap={4}>
                  <Text size="xs">{f.filename}</Text>
                  <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                    {f.language}
                  </Badge>
                </Group>
              </Tabs.Tab>
            ))}
            {isOwner && (
              <Tooltip label="Tambah file" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" ml={4} my="auto" onClick={onEdit}>
                  <TbPlus size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Tabs.List>
          {gist.files.map((f, i) => (
            <Tabs.Panel key={f.filename} value={String(i)} pt="xs">
              <Group justify="flex-end" gap={4} mb={4}>
                <Tooltip label="Preview layar penuh">
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setFullscreen(true)}>
                    <TbArrowsMaximize size={11} />
                  </ActionIcon>
                </Tooltip>
                <CopyButton value={f.content} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Tersalin!' : 'Salin konten'}>
                      <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
                <Tooltip label="Buka raw">
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    component="a"
                    href={
                      gist.isPublic
                        ? `/api/public/gists/${gist.id}/raw/${encodeURIComponent(f.filename)}`
                        : `/api/envman/gists/${gist.id}/raw/${encodeURIComponent(f.filename)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <TbEye size={11} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Box style={{ maxHeight: 400, overflowY: 'auto' }}>
                <MarkdownRenderer fontSize={13}>{renderContent(f)}</MarkdownRenderer>
              </Box>
            </Tabs.Panel>
          ))}
        </Tabs>

        <Group gap={4} wrap="wrap">
          {gist.tags.map((t) => (
            <Badge key={t} size="xs" variant="outline" color="gray">
              {t}
            </Badge>
          ))}
          <Text size="xs" c="dimmed" ml="auto">
            oleh {gist.user.name} · {relTime(gist.updatedAt)}
          </Text>
        </Group>

        <Divider />

        <Group justify="space-between">
          <Group gap={4}>
            <CopyButton value={file?.content ?? ''} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  onClick={copy}
                >
                  {copied ? 'Tersalin!' : `Copy ${file?.filename ?? ''}`}
                </Button>
              )}
            </CopyButton>
            {file && (
              <Button
                type="button"
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<TbEye size={13} />}
                component="a"
                href={
                  gist.isPublic
                    ? `/api/public/gists/${gist.id}/raw/${encodeURIComponent(file.filename)}`
                    : `/api/envman/gists/${gist.id}/raw/${encodeURIComponent(file.filename)}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Raw
              </Button>
            )}
          </Group>
          {isOwner && (
            <Button type="button" size="xs" leftSection={<TbEdit size={13} />} onClick={onEdit}>
              Edit
            </Button>
          )}
        </Group>
      </Stack>

      <Modal
        opened={fullscreen}
        onClose={() => setFullscreen(false)}
        fullScreen
        radius={0}
        title={
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <TbFileCode size={14} style={{ flexShrink: 0 }} />
            <Text size="sm" fw={600} lineClamp={1}>
              {file?.filename}
            </Text>
            {file && (
              <Badge size="xs" variant="dot" color={getLangColor(file.language)} style={{ flexShrink: 0 }}>
                {file.language}
              </Badge>
            )}
          </Group>
        }
        styles={{ body: { paddingTop: 'var(--mantine-spacing-md)' } }}
      >
        {file && <MarkdownRenderer fontSize={13}>{renderContent(file)}</MarkdownRenderer>}
      </Modal>
    </Paper>
  )
}
