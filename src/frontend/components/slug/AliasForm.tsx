import { Box, Button, Code, Group, Stack, TagsInput, Text, Textarea, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { emptyForm, type Alias, type FormState } from './alias-types'

interface Props {
  slug: string
  editing: Alias | null
  onClose: () => void
}

export function AliasForm({ slug, editing, onClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(
    editing
      ? { name: editing.name, args: editing.args, description: editing.description ?? '', tags: editing.tags }
      : emptyForm(),
  )

  const save = useMutation({
    mutationFn: () =>
      editing
        ? apiFetch(`/api/envman/projects/${slug}/aliases/${editing.name}`, {
            method: 'PATCH',
            body: JSON.stringify({ args: form.args, description: form.description, tags: form.tags }),
          })
        : apiFetch(`/api/envman/projects/${slug}/aliases`, {
            method: 'POST',
            body: JSON.stringify({ name: form.name, args: form.args, description: form.description, tags: form.tags }),
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'aliases', slug] })
      notifyOk(editing ? 'Alias diperbarui' : 'Alias dibuat')
      onClose()
    },
    onError: (e) => notifyErr(e),
  })

  return (
    <Stack gap="sm">
      {!editing && (
        <TextInput
          label="Nama alias"
          description="Huruf kecil, angka, tanda hubung. Contoh: deploy, start-dev"
          placeholder="deploy"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      )}
      <Textarea
        label="Args"
        description="Argumen yang disimpan — apa yang biasanya kamu ketik setelah envman"
        placeholder="-e myapp:production -- docker compose up -d"
        value={form.args}
        onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
        autosize
        minRows={2}
        required
      />
      {form.name && !editing && (
        <Box>
          <Text size="xs" c="dimmed" mb={4}>Preview perintah:</Text>
          <Code block fz="xs">
            envman run {slug}:{form.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}
          </Code>
        </Box>
      )}
      <TextInput
        label="Deskripsi"
        description="Opsional — penjelasan singkat apa yang dilakukan alias ini"
        placeholder="Deploy ke production dengan rebuild image"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <TagsInput
        label="Tags"
        description="Opsional — untuk organisasi dan filter. Tekan Enter untuk tambah tag."
        placeholder="ci, deploy, docker"
        value={form.tags}
        onChange={(v) => setForm((f) => ({ ...f, tags: v }))}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onClose}>Batal</Button>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!form.args.trim() || (!editing && !form.name.trim())}
        >
          {editing ? 'Simpan perubahan' : 'Buat alias'}
        </Button>
      </Group>
    </Stack>
  )
}
