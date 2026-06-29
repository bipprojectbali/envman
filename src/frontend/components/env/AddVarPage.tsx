import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import type { UseMutationResult } from '@tanstack/react-query'
import { TbChevronLeft, TbChevronRight, TbLock, TbLockOpen, TbPlus } from 'react-icons/tb'

interface AddForm {
  key: string
  value: string
  isSecret: boolean
}

interface Props {
  env: string
  form: AddForm
  setForm: React.Dispatch<React.SetStateAction<AddForm>>
  addVar: UseMutationResult<any, any, AddForm>
  closeAdd: () => void
  isMobile: boolean | undefined
}

export function AddVarPage({ env, form, setForm, addVar, closeAdd, isMobile }: Props) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeAdd}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeAdd}>
            {env}
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>
            Tambah Variabel
          </Text>
        </Group>
        <Divider />
        <Stack gap="sm">
          <TextInput
            label="Key"
            placeholder="DATABASE_URL"
            description="Otomatis dikonversi ke UPPER_SNAKE_CASE"
            value={form.key}
            autoFocus
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
              }))
            }
            rightSection={
              form.key ? (
                <Text fz={9} c="dimmed">
                  {form.key.length}
                </Text>
              ) : undefined
            }
            styles={{ input: { fontFamily: 'monospace' } }}
            size={isMobile ? 'sm' : 'md'}
          />
          {form.isSecret ? (
            <PasswordInput
              label="Value"
              placeholder="Nilai rahasia..."
              description="Akan dienkripsi sebelum disimpan"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              size={isMobile ? 'sm' : 'md'}
            />
          ) : (
            <TextInput
              label="Value"
              placeholder="Nilai..."
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              size={isMobile ? 'sm' : 'md'}
            />
          )}
          <Box
            p="sm"
            style={{
              borderRadius: 'var(--mantine-radius-sm)',
              background: 'var(--mantine-color-default-hover)',
            }}
          >
            <Group justify="space-between" align="center" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>
                  {form.isSecret ? 'Secret' : 'Plain'}
                </Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
                  {form.isSecret ? 'Nilai dienkripsi, tersembunyi di UI' : 'Nilai terlihat semua member'}
                </Text>
              </Box>
              <ActionIcon
                size={36}
                variant={form.isSecret ? 'filled' : 'light'}
                color={form.isSecret ? 'red' : 'gray'}
                onClick={() => setForm((f) => ({ ...f, isSecret: !f.isSecret }))}
                style={{ flexShrink: 0 }}
              >
                {form.isSecret ? <TbLock size={16} /> : <TbLockOpen size={16} />}
              </ActionIcon>
            </Group>
          </Box>
          <Divider />
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={closeAdd} disabled={addVar.isPending}>
              Batal
            </Button>
            <Button
              onClick={() => addVar.mutate(form)}
              loading={addVar.isPending}
              disabled={!form.key || form.value === ''}
              leftSection={<TbPlus size={14} />}
              size={isMobile ? 'md' : 'sm'}
            >
              Tambah Variabel
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Paper>
  )
}
