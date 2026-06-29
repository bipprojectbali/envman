import { Alert, Button, Code, Group, Stack, Text, TextInput, ThemeIcon } from '@mantine/core'
import { useState } from 'react'
import { TbAlertTriangle, TbPencil, TbVariable } from 'react-icons/tb'
import { ENV_NAME_RE } from '@/frontend/lib/project-utils'

interface Props {
  oldName: string
  varCount: number
  otherNames: string[]
  onCancel: () => void
  onConfirm: (newName: string) => Promise<void> | void
}

export function RenameEnvForm({ oldName, varCount, otherNames, onCancel, onConfirm }: Props) {
  const [name, setName] = useState(oldName)
  const [loading, setLoading] = useState(false)
  const normalized = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
  const valid = normalized.length > 0 && ENV_NAME_RE.test(normalized)
  const unchanged = normalized === oldName
  const duplicate = !unchanged && otherNames.includes(normalized)
  const error =
    name.length === 0
      ? null
      : duplicate
        ? `Environment "${normalized}" sudah ada`
        : !valid
          ? 'Hanya huruf kecil, angka, dan strip. Tidak diawali/diakhiri strip.'
          : null
  const canSubmit = valid && !duplicate && !unchanged && !loading

  const handleConfirm = async () => {
    if (!canSubmit) return
    setLoading(true)
    try {
      await onConfirm(normalized)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        Rename <Code fz="xs">{oldName}</Code>
        {varCount > 0 && (
          <>
            {' '}
            dengan <strong>{varCount} variabel</strong>
          </>
        )}
        .
      </Text>
      <TextInput
        label="Nama baru"
        placeholder={oldName}
        value={name}
        autoFocus
        data-autofocus
        spellCheck={false}
        leftSection={<TbVariable size={13} />}
        onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSubmit) handleConfirm()
        }}
        error={error ?? undefined}
      />
      <Alert color="yellow" icon={<TbAlertTriangle size={13} />} p="xs">
        <Text size="xs">
          Semua CLI / CI yang masih pakai <Code fz="xs">{oldName}</Code> akan langsung gagal — mereka harus diupdate ke{' '}
          <Code fz="xs">{normalized || '<nama-baru>'}</Code> setelah rename.
        </Text>
      </Alert>
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button
          color="blue"
          leftSection={<TbPencil size={13} />}
          disabled={!canSubmit}
          loading={loading}
          onClick={handleConfirm}
        >
          Rename
        </Button>
      </Group>
    </Stack>
  )
}
