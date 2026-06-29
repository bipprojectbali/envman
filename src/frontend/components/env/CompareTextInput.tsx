import { ActionIcon, Badge, Box, Group, Switch, Text, Textarea, Tooltip } from '@mantine/core'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { TbEye, TbEyeOff } from 'react-icons/tb'

interface CompareTextInputProps {
  localText: string
  onChange: (text: string) => void
  localVarCount: number
  canEdit: boolean
  onlyLocalCount: number
  addAsSecret: boolean
  onAddAsSecretChange: (v: boolean) => void
}

export function CompareTextInput({
  localText, onChange, localVarCount, canEdit, onlyLocalCount, addAsSecret, onAddAsSecretChange,
}: CompareTextInputProps) {
  const [revealLocal, setRevealLocal] = useState(false)

  return (
    <Box
      style={{
        width: 380,
        flexShrink: 0,
        borderRight: '1px solid var(--mantine-color-default-border)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text size="xs" fw={600} c="dimmed">PASTE .ENV LOCAL</Text>
        <Group gap={4}>
          {localVarCount > 0 && (
            <Badge size="xs" variant="light" color="blue">{localVarCount} keys</Badge>
          )}
          <Tooltip label={revealLocal ? 'Sembunyikan value' : 'Tampilkan value'}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRevealLocal((v) => !v)}>
              {revealLocal ? <TbEyeOff size={12} /> : <TbEye size={12} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Textarea
        placeholder={`DATABASE_URL=postgres://...\nAPI_KEY=xxx\nPORT=3000\n\n# Komentar diabaikan`}
        value={localText}
        onChange={(e) => onChange(e.target.value)}
        minRows={20}
        autosize={false}
        styles={{
          wrapper: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
          input: {
            flex: 1,
            border: 'none',
            borderRadius: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            WebkitTextSecurity: revealLocal ? 'none' : 'disc',
          } as CSSProperties,
        }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      />
      {canEdit && onlyLocalCount > 0 && (
        <Box px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Switch
            size="xs"
            label={<Text size="xs">Tambah sebagai secret</Text>}
            checked={addAsSecret}
            onChange={(e) => onAddAsSecretChange(e.currentTarget.checked)}
          />
        </Box>
      )}
    </Box>
  )
}
