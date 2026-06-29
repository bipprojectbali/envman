import { Box, Button, Group, Kbd, MultiSelect, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbEdit, TbEye, TbFileText, TbTag } from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { Note } from './NoteCard'

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0 || Number.isNaN(diff)) return ''
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
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NoteForm({ slug, note, onClose }: { slug: string; note?: Note; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [preview, setPreview] = useState<'write' | 'preview'>('write')
  const [tagInput, setTagInput] = useState('')

  const save = useMutation({
    mutationFn: () => {
      if (note) {
        return apiFetch(`/api/envman/projects/${slug}/notes/${note.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, body, tags }),
        })
      }
      return apiFetch(`/api/envman/projects/${slug}/notes`, {
        method: 'POST',
        body: JSON.stringify({ title, body, tags }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'notes', slug] })
      notifyOk(note ? 'Note diperbarui' : 'Note dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  const canSave = !!title.trim() && !save.isPending
  const charCount = body.length
  const lineCount = body ? body.split('\n').length : 0
  const wordCount = body ? body.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <Stack gap="lg">
      {/* ── Identitas ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Judul
        </Text>
        <TextInput
          placeholder="Mis. 'Deployment runbook', 'Troubleshooting auth flow', ..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          data-autofocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (canSave) save.mutate()
            }
          }}
        />
      </Stack>

      {/* ── Konten ── */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
              Konten
            </Text>
            <Text size="xs" c="dimmed">
              (Markdown didukung)
            </Text>
          </Group>
          <SegmentedControl
            size="xs"
            value={preview}
            onChange={(v) => setPreview(v as 'write' | 'preview')}
            data={[
              {
                label: (
                  <Group gap={4}>
                    <TbEdit size={12} />
                    <span>Tulis</span>
                  </Group>
                ),
                value: 'write',
              },
              {
                label: (
                  <Group gap={4}>
                    <TbEye size={12} />
                    <span>Preview</span>
                  </Group>
                ),
                value: 'preview',
              },
            ]}
          />
        </Group>
        {preview === 'write' ? (
          <CodeEditor
            value={body}
            onChange={setBody}
            language="markdown"
            filename="note.md"
            placeholder="# Heading\n\nTulis catatan dalam format Markdown..."
            height={360}
          />
        ) : (
          <Box
            p="md"
            mih={240}
            style={{ overflow: 'auto', maxHeight: 480, border: '1px solid var(--mantine-color-default-border)' }}
          >
            {body ? (
              <MarkdownRenderer fontSize={13}>{body}</MarkdownRenderer>
            ) : (
              <Text size="sm" c="dimmed" fs="italic">
                Tidak ada konten — klik "Tulis" untuk mulai menulis.
              </Text>
            )}
          </Box>
        )}
        <Group gap="md" justify="space-between">
          <Group gap="md">
            <Text size="xs" c="dimmed">
              {lineCount} baris
            </Text>
            <Text size="xs" c="dimmed">
              {wordCount} kata
            </Text>
            <Text size="xs" c="dimmed">
              {charCount} karakter
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            <Kbd size="xs">⌘</Kbd>+<Kbd size="xs">Enter</Kbd> untuk simpan
          </Text>
        </Group>
      </Stack>

      {/* ── Tags ── */}
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Tags
        </Text>
        <MultiSelect
          placeholder="Ketik lalu tekan Enter untuk tambah tag baru..."
          data={[...new Set([...tags, ...(tagInput ? [tagInput] : [])])]}
          value={tags}
          onChange={setTags}
          searchable
          searchValue={tagInput}
          onSearchChange={setTagInput}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
              e.preventDefault()
              const t = tagInput
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
              if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
              setTagInput('')
            }
          }}
          leftSection={<TbTag size={13} />}
          clearable
        />
      </Stack>

      {note && (
        <Box
          p="xs"
          bg="var(--mantine-color-default-hover)"
          style={{ border: '1px solid var(--mantine-color-default-border)' }}
        >
          <Text size="xs" c="dimmed">
            Dibuat {absoluteTime(note.createdAt)} oleh {note.author.name}
            {new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000 && (
              <> · diedit {relTime(note.updatedAt)}</>
            )}
          </Text>
        </Box>
      )}

      <Group justify="flex-end" gap="xs">
        <Button type="button" variant="subtle" color="gray" onClick={onClose} disabled={save.isPending}>
          Batal
        </Button>
        <Button
          type="button"
          color="primary"
          leftSection={<TbFileText size={14} />}
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!canSave}
        >
          {note ? 'Simpan perubahan' : 'Buat Note'}
        </Button>
      </Group>
    </Stack>
  )
}
