import {
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type React from 'react'
import {
  TbCalendar,
  TbInfoCircle,
  TbLock,
  TbLockOpen,
} from 'react-icons/tb'
import { ScopeSelector, type ProjectOption } from './ScopeSelector'

export interface TokenFormState {
  name: string
  canWrite: boolean
  expiresAt: string
  scopes: string[]
  tags: string[]
}

interface Props {
  form: TokenFormState
  setForm: React.Dispatch<React.SetStateAction<TokenFormState>>
  projects: ProjectOption[]
  allTags: { value: string; label: string }[]
}

export function TokenForm({ form, setForm, projects, allTags }: Props) {
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Identitas</Text>
        <TextInput
          label="Nama token"
          placeholder="ci-github, laptop-bip, deploy-script"
          description="Gunakan nama yang menggambarkan dari mana token ini dipakai"
          value={form.name}
          autoFocus
          onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))}
        />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Izin Akses</Text>
        <Box
          p="sm"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: `1px solid ${form.canWrite ? 'var(--mantine-color-orange-5)' : 'var(--mantine-color-default-border)'}`,
            background: form.canWrite ? 'var(--mantine-color-orange-light)' : undefined,
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <Group gap="xs" mb={2}>
                <Text size="xs" fw={600}>{form.canWrite ? 'Read-Write' : 'Read-Only'}</Text>
                {!form.canWrite && <Badge size="xs" color="blue" variant="light">Recommended</Badge>}
                {form.canWrite && <Badge size="xs" color="orange" variant="light">Advanced</Badge>}
              </Group>
              <Text size="xs" c="dimmed">
                {form.canWrite
                  ? 'Token dapat membaca DAN menulis vars — gunakan hanya untuk automation/deploy script.'
                  : 'Token hanya dapat membaca vars — aman untuk CLI lokal dan CI/CD pipeline.'}
              </Text>
            </Box>
            <Switch
              checked={form.canWrite}
              onChange={(e) => setForm((x) => ({ ...x, canWrite: e.target.checked }))}
              color="orange"
            />
          </Group>
        </Box>
      </Stack>

      <Stack gap="xs">
        <Group gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Scope Akses</Text>
          <Tooltip label="Batasi token hanya ke project/environment tertentu untuk keamanan lebih baik">
            <TbInfoCircle size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          </Tooltip>
        </Group>
        <ScopeSelector projects={projects} value={form.scopes} onChange={(v) => setForm((x) => ({ ...x, scopes: v }))} />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Tags</Text>
        <TagsInput
          placeholder="Tambah tag, tekan Enter"
          description="Opsional — untuk pengelompokan dan filter token"
          value={form.tags}
          onChange={(v) => setForm((x) => ({ ...x, tags: v }))}
          data={allTags.map((t) => t.value)}
          clearable
          splitChars={[',', ' ']}
        />
      </Stack>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Kedaluwarsa</Text>
        <Stack gap="xs">
          <Group gap="xs" wrap="wrap">
            {[
              { label: '7 hari', days: 7 },
              { label: '30 hari', days: 30 },
              { label: '90 hari', days: 90 },
              { label: '1 tahun', days: 365 },
            ].map(({ label, days }) => {
              const d = new Date()
              d.setDate(d.getDate() + days)
              const val = d.toISOString().split('T')[0]
              return (
                <Button
                  key={days}
                  size="compact-xs"
                  variant={form.expiresAt === val ? 'filled' : 'default'}
                  color="primary"
                  leftSection={<TbCalendar size={11} />}
                  onClick={() => setForm((x) => ({ ...x, expiresAt: x.expiresAt === val ? '' : val }))}
                >
                  {label}
                </Button>
              )
            })}
            {form.expiresAt && (
              <Button size="compact-xs" variant="subtle" color="red" onClick={() => setForm((x) => ({ ...x, expiresAt: '' }))}>
                Hapus batas
              </Button>
            )}
          </Group>
          <TextInput
            type="date"
            placeholder="Atau pilih tanggal custom..."
            leftSection={<TbCalendar size={13} />}
            min={new Date().toISOString().split('T')[0]}
            value={form.expiresAt}
            onChange={(e) => setForm((x) => ({ ...x, expiresAt: e.target.value }))}
            description={!form.expiresAt ? 'Kosong = tidak ada batas waktu (tidak direkomendasikan untuk CI/CD)' : undefined}
          />
        </Stack>
      </Stack>
    </Stack>
  )
}
