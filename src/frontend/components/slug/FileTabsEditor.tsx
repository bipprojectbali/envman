import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { TbEdit, TbEye, TbFileCode, TbFilePlus, TbX } from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { LANGUAGES, adjustFilenameForLang, getLangColor } from '@/frontend/lib/languages'
import type { FileEntry } from './FileForm'

interface Props {
  files: FileEntry[]
  activeFile: number
  preview: 'write' | 'preview'
  setActiveFile: (i: number) => void
  setPreview: (v: 'write' | 'preview') => void
  addFile: () => void
  removeFile: (i: number) => void
  updateFile: (i: number, patch: Partial<FileEntry>) => void
}

export function FileTabsEditor({ files, activeFile, preview, setActiveFile, setPreview, addFile, removeFile, updateFile }: Props) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon size={22} radius="md" variant="light" color="blue"><TbFileCode size={13} /></ThemeIcon>
          <Text size="sm" fw={600}>Files</Text>
          <Badge size="xs" variant="light" color="gray">{files.length}</Badge>
        </Group>
        <Button type="button" size="xs" variant="light" color="blue" leftSection={<TbFilePlus size={13} />} onClick={addFile}>
          Tambah file
        </Button>
      </Group>

      <Tabs value={String(activeFile)} onChange={(v) => setActiveFile(Number(v))} variant="outline" radius="md">
        <Tabs.List>
          {files.map((f, i) => (
            <Tabs.Tab
              key={f.filename || i}
              value={String(i)}
              leftSection={<Box style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: `var(--mantine-color-${getLangColor(f.language)}-5)` }} />}
              rightSection={
                files.length > 1 ? (
                  <Tooltip label="Hapus file" position="top" withArrow>
                    <ActionIcon component="div" size="xs" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); removeFile(i) }}>
                      <TbX size={10} />
                    </ActionIcon>
                  </Tooltip>
                ) : undefined
              }
            >
              <Text size="xs" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.filename || `file${i + 1}`}
              </Text>
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {files.map((f, i) => (
          <Tabs.Panel key={f.filename || i} value={String(i)} pt="sm">
            <Stack gap="xs">
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  label="Filename" size="xs" placeholder="filename.ext" value={f.filename}
                  onChange={(e) => updateFile(i, { filename: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                  style={{ flex: 1 }} leftSection={<TbFileCode size={12} />}
                />
                <Select
                  label="Language" size="xs" value={f.language}
                  onChange={(v) => {
                    const newLang = v ?? 'plaintext'
                    updateFile(i, { language: newLang, filename: adjustFilenameForLang(f.filename, f.language, newLang) })
                  }}
                  data={LANGUAGES} searchable allowDeselect={false} style={{ width: 160 }}
                />
                <SegmentedControl
                  size="xs" value={preview} onChange={(v) => setPreview(v as 'write' | 'preview')}
                  data={[
                    { label: <Group gap={4} wrap="nowrap"><TbEdit size={11} /><span>Tulis</span></Group>, value: 'write' },
                    { label: <Group gap={4} wrap="nowrap"><TbEye size={11} /><span>Preview</span></Group>, value: 'preview' },
                  ]}
                />
              </Group>

              {preview === 'write' ? (
                <Box>
                  <CodeEditor
                    value={f.content} onChange={(v) => updateFile(i, { content: v })}
                    language={f.language} filename={f.filename}
                    placeholder={f.language === 'markdown' ? '# Heading\n\nKonten markdown...' : `Isi konten ${f.language} di sini...`}
                    height={400}
                  />
                  <Group justify="space-between" mt={4} px={4}>
                    <Group gap="xs">
                      <Badge size="xs" variant="dot" color={getLangColor(f.language)}>{f.language}</Badge>
                      <Text size="xs" c="dimmed">
                        {f.content ? `${f.content.split('\n').length} baris · ${f.content.length} karakter` : 'Kosong'}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">Monaco editor · syntax highlight</Text>
                  </Group>
                  {(f.language === 'typescript' || f.language === 'javascript') && (
                    <Text size="xs" c="dimmed" mt={4} px={4}>
                      Bun auto-install: npm imports langsung dipakai tanpa <Code fz="xs">bun install</Code>. Pin versi:{' '}
                      <Code fz="xs">{'import { z } from "zod@^3.22"'}</Code>
                    </Text>
                  )}
                </Box>
              ) : (
                <Box p="md" mih={220} style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
                  {f.content ? (
                    <MarkdownRenderer fontSize={13}>
                      {f.language === 'markdown' ? f.content : `\`\`\`${f.language}\n${f.content}\n\`\`\``}
                    </MarkdownRenderer>
                  ) : (
                    <Group justify="center" py="xl">
                      <Stack gap={4} align="center"><TbEye size={20} opacity={0.3} /><Text size="sm" c="dimmed">Belum ada konten untuk preview.</Text></Stack>
                    </Group>
                  )}
                </Box>
              )}
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  )
}
