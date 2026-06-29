import { Badge, Box, Button, Code, Divider, Group, Stack, TagsInput, Text, TextInput, Tooltip } from '@mantine/core'
import type React from 'react'
import { TbCheck, TbPlus } from 'react-icons/tb'
import { SLUG_RE, tagColor } from '@/frontend/lib/project-utils'

interface FormData {
  slug: string
  name: string
  description: string
  tags: string[]
}

interface Props {
  form: FormData
  setForm: React.Dispatch<React.SetStateAction<FormData>>
  slugManual: boolean
  setSlugManual: (v: boolean) => void
  allTagValues: string[]
  existingSlugs: string[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
}

export function CreateProjectForm({
  form,
  setForm,
  slugManual,
  setSlugManual,
  allTagValues,
  existingSlugs,
  isPending,
  onClose,
  onSubmit,
}: Props) {
  const slugInvalid = !!form.slug && !SLUG_RE.test(form.slug)
  const slugDuplicate = !!form.slug && existingSlugs.includes(form.slug)
  const slugError = slugDuplicate
    ? `Slug "${form.slug}" sudah dipakai project lain`
    : slugInvalid
      ? 'Hanya huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.'
      : null
  const canSubmit = !!form.name.trim() && !!form.slug && !slugInvalid && !slugDuplicate && !isPending

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Identitas
        </Text>
        <TextInput
          label="Nama project"
          placeholder="My App, Backend API, Customer Portal, ..."
          value={form.name}
          autoFocus
          data-autofocus
          onChange={(e) => {
            const name = e.target.value
            setForm((f) => ({
              ...f,
              name,
              slug: slugManual
                ? f.slug
                : name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
            }))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) onSubmit()
          }}
        />
        <TextInput
          label="Slug"
          placeholder="my-app"
          value={form.slug}
          description={
            <Text component="span" size="xs" c="dimmed">
              Dipakai di CLI: <Code fz="xs">envman -e {form.slug || '<slug>'}:production -- bun run start</Code>
            </Text>
          }
          rightSection={
            form.slug && !slugInvalid && !slugDuplicate ? (
              <Tooltip label="Slug valid">
                <Box c="teal">
                  <TbCheck size={14} />
                </Box>
              </Tooltip>
            ) : undefined
          }
          onChange={(e) => {
            setSlugManual(true)
            setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) onSubmit()
          }}
          error={slugError ?? undefined}
        />
        <TextInput
          label="Deskripsi"
          placeholder="Opsional — penjelasan singkat project ini"
          description="Muncul di card daftar project untuk konteks cepat"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          Tags
        </Text>
        <TagsInput
          placeholder="Tambah tag, tekan Enter"
          description="Opsional — untuk filter dan pengelompokan project"
          value={form.tags}
          onChange={(tags) => setForm((f) => ({ ...f, tags }))}
          data={allTagValues}
          clearable
          splitChars={[',', ' ']}
        />
        {form.tags.length > 0 && (
          <Group gap={4}>
            {form.tags.map((t) => (
              <Badge key={t} size="xs" variant="light" color={tagColor(t)}>
                {t}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <Divider />

      <Box
        p="xs"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-default-hover)',
        }}
      >
        <Text size="xs" fw={600} mb={4}>
          Setelah dibuat:
        </Text>
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            ✓ Project langsung jadi milikmu (role <strong>OWNER</strong>)
          </Text>
          <Text size="xs" c="dimmed">
            ✓ Kamu akan diarahkan ke halaman environment untuk setup pertama
          </Text>
          <Text size="xs" c="dimmed">
            ✓ Bisa tambah anggota dan environment setelah project dibuat
          </Text>
        </Stack>
      </Box>

      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button
          leftSection={<TbPlus size={14} />}
          color="primary"
          onClick={onSubmit}
          loading={isPending}
          disabled={!canSubmit}
        >
          {form.name ? `Buat "${form.name}"` : 'Buat Project'}
        </Button>
      </Group>
    </Stack>
  )
}
