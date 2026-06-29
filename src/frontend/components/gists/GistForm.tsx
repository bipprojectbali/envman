import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  MultiSelect,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbCheck,
  TbEdit,
  TbEye,
  TbFileCode,
  TbFilePlus,
  TbGlobe,
  TbLock,
  TbTag,
  TbX,
} from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { apiFetch } from '@/frontend/lib/api'
import { adjustFilenameForLang, getLangColor, LANGUAGES } from '@/frontend/lib/languages'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { Gist, GistFile } from './gist-types'

interface Props {
  gist?: Gist
  onClose: () => void
}

export function GistForm({ gist, onClose }: Props) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(gist?.title ?? '')
  const [description, setDescription] = useState(gist?.description ?? '')
  const [isPublic, setIsPublic] = useState(gist?.isPublic ?? false)
  const [tags, setTags] = useState<string[]>(gist?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [files, setFiles] = useState<GistFile[]>(
    gist?.files.length ? gist.files : [{ filename: 'file1.txt', content: '', language: 'plaintext' }],
  )
  const [activeFile, setActiveFile] = useState(0)
  const [preview, setPreview] = useState<'write' | 'preview'>('write')

  const save = useMutation({
    mutationFn: () => {
      const body = { title, description, files, isPublic, tags }
      return gist
        ? apiFetch(`/api/envman/gists/${gist.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : apiFetch('/api/envman/gists', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'gists', 'infinite'] })
      notifyOk(gist ? 'Gist diperbarui' : 'Gist dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  const addFile = () => {
    const n = files.length + 1
    setFiles((f) => [...f, { filename: `file${n}.txt`, content: '', language: 'plaintext' }])
    setActiveFile(files.length)
  }

  const removeFile = (i: number) => {
    if (files.length === 1) return
    setFiles((f) => f.filter((_, idx) => idx !== i))
    setActiveFile(Math.max(0, i - 1))
  }

  const updateFile = (i: number, patch: Partial<GistFile>) =>
    setFiles((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const totalLines = files.reduce((sum, f) => sum + (f.content ? f.content.split('\n').length : 0), 0)
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0)
  const canSave = !!title.trim() && files.every((f) => f.filename.trim())
  const isEditMode = !!gist

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <TextInput
          label={
            <Group gap={6} component="span">
              <Text component="span" size="sm" fw={600}>
                Judul
              </Text>
              <Text component="span" size="xs" c="red">
                *
              </Text>
            </Group>
          }
          placeholder="Nama gist (contoh: Postgres backup script)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!isEditMode}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          size="md"
          required
        />
        <TextInput
          label="Deskripsi"
          placeholder="Deskripsi singkat — apa fungsi snippet ini, kapan dipakai (opsional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          size="sm"
        />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <ThemeIcon size={22} radius="md" variant="light" color="primary">
              <TbFileCode size={13} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Files
            </Text>
            <Badge size="xs" variant="light" color="gray">
              {files.length}
            </Badge>
          </Group>
          <Button type="button" size="xs" variant="light" color="primary" leftSection={<TbFilePlus size={13} />} onClick={addFile}>
            Tambah file
          </Button>
        </Group>

        <Tabs value={String(activeFile)} onChange={(v) => setActiveFile(Number(v))} variant="outline" radius="md">
          <Tabs.List>
            {files.map((f, i) => (
              <Tabs.Tab
                key={f.filename || i}
                value={String(i)}
                leftSection={
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: `var(--mantine-color-${getLangColor(f.language)}-5)`,
                    }}
                  />
                }
                rightSection={
                  files.length > 1 ? (
                    <Tooltip label="Hapus file" position="top" withArrow>
                      <ActionIcon
                        component="div"
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(i)
                        }}
                      >
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
            // biome-ignore lint/suspicious/noArrayIndexKey: gist files have no stable id
            <Tabs.Panel key={i} value={String(i)} pt="sm">
              <Stack gap="xs">
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput
                    label="Filename"
                    size="xs"
                    placeholder="filename.ext"
                    value={f.filename}
                    onChange={(e) => updateFile(i, { filename: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                    style={{ flex: 1 }}
                    leftSection={<TbFileCode size={12} />}
                  />
                  <Select
                    label="Language"
                    size="xs"
                    value={f.language}
                    onChange={(v) => {
                      const newLang = v ?? 'plaintext'
                      updateFile(i, {
                        language: newLang,
                        filename: adjustFilenameForLang(f.filename, f.language, newLang),
                      })
                    }}
                    data={LANGUAGES}
                    searchable
                    allowDeselect={false}
                    style={{ width: 160 }}
                  />
                  <SegmentedControl
                    size="xs"
                    value={preview}
                    onChange={(v) => setPreview(v as 'write' | 'preview')}
                    data={[
                      {
                        label: (
                          <Group gap={4} wrap="nowrap">
                            <TbEdit size={11} />
                            <span>Tulis</span>
                          </Group>
                        ),
                        value: 'write',
                      },
                      {
                        label: (
                          <Group gap={4} wrap="nowrap">
                            <TbEye size={11} />
                            <span>Preview</span>
                          </Group>
                        ),
                        value: 'preview',
                      },
                    ]}
                  />
                </Group>

                <Text size="xs" c="dimmed" mt={-4}>
                  Tip: ekstensi filename akan otomatis menyesuaikan saat kamu ganti language.
                </Text>

                {preview === 'write' ? (
                  <Box>
                    <CodeEditor
                      value={f.content}
                      onChange={(v) => updateFile(i, { content: v })}
                      language={f.language}
                      filename={f.filename}
                      placeholder={
                        f.language === 'markdown'
                          ? '# Heading\n\nKonten markdown di sini...'
                          : f.language === 'bash'
                            ? '#!/usr/bin/env bash\nset -euo pipefail\n\n# script di sini...'
                            : `Isi konten ${f.language} di sini...`
                      }
                      height={400}
                    />
                    <Group justify="space-between" mt={4} px={4}>
                      <Group gap="xs">
                        <Badge size="xs" variant="dot" color={getLangColor(f.language)}>
                          {f.language}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {f.content
                            ? `${f.content.split('\n').length} baris · ${f.content.length} karakter`
                            : 'Kosong'}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Monaco editor · syntax highlight
                      </Text>
                    </Group>
                  </Box>
                ) : (
                  <Box
                    style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
                    p="md"
                    mih={220}
                  >
                    {f.content ? (
                      <MarkdownRenderer fontSize={13}>
                        {f.language === 'markdown' ? f.content : `\`\`\`${f.language}\n${f.content}\n\`\`\``}
                      </MarkdownRenderer>
                    ) : (
                      <Group justify="center" py="xl">
                        <Stack gap={4} align="center">
                          <TbEye size={20} opacity={0.3} />
                          <Text size="sm" c="dimmed">
                            Belum ada konten untuk preview.
                          </Text>
                        </Stack>
                      </Group>
                    )}
                  </Box>
                )}
              </Stack>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>

      <Divider />

      <Stack gap="sm">
        <MultiSelect
          label="Tags"
          description="Tekan Enter untuk menambah tag baru. Tag membantu pencarian dan pengelompokan."
          placeholder="Ketik tag lalu Enter..."
          data={tags}
          value={tags}
          onChange={setTags}
          searchable
          searchValue={tagInput}
          onSearchChange={setTagInput}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
              e.preventDefault()
              const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
              if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
              setTagInput('')
            }
          }}
          leftSection={<TbTag size={13} />}
          clearable
        />

        <Box>
          <Text size="sm" fw={500} mb={6}>
            Visibility
          </Text>
          <SimpleGrid cols={2} spacing="xs">
            <Box
              p="sm"
              style={{
                cursor: 'pointer',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                borderColor: !isPublic ? 'var(--mantine-color-primary)' : undefined,
                background: !isPublic ? 'var(--mantine-color-violet-light)' : undefined,
              }}
              onClick={() => setIsPublic(false)}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" variant="light" color={!isPublic ? 'violet' : 'gray'}>
                  <TbLock size={14} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>Private</Text>
                  <Text size="xs" c="dimmed">Hanya kamu yang bisa lihat</Text>
                </Box>
                {!isPublic && <TbCheck size={16} color="var(--mantine-color-primary)" />}
              </Group>
            </Box>
            <Box
              p="sm"
              style={{
                cursor: 'pointer',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                borderColor: isPublic ? 'var(--mantine-color-primary)' : undefined,
                background: isPublic ? 'var(--mantine-color-violet-light)' : undefined,
              }}
              onClick={() => setIsPublic(true)}
            >
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" variant="light" color={isPublic ? 'violet' : 'gray'}>
                  <TbGlobe size={14} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>Public</Text>
                  <Text size="xs" c="dimmed">Semua user envmanager bisa lihat</Text>
                </Box>
                {isPublic && <TbCheck size={16} color="var(--mantine-color-primary)" />}
              </Group>
            </Box>
          </SimpleGrid>
        </Box>
      </Stack>

      <Divider />

      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {files.length} file · {totalLines} baris · {totalChars} karakter
        </Text>
        <Group gap="xs">
          <Button type="button" variant="subtle" color="gray" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            leftSection={<TbCheck size={14} />}
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!canSave}
            color="primary"
          >
            {isEditMode ? 'Simpan perubahan' : 'Buat Gist'}
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
