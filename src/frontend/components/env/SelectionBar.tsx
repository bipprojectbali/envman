import { Badge, Box, Button, Group, Tooltip } from '@mantine/core'
import { TbCheck, TbCopy, TbKey, TbX } from 'react-icons/tb'
import { toEnvText, toKeyTemplate } from '@/frontend/lib/env-clipboard'
import type { EnvVar } from '@/frontend/types/env'

interface Props {
  selectedIds: Set<string>
  clearSelection: () => void
  copiedSelected: boolean
  setCopiedSelected: (v: boolean) => void
  copiedKeys: boolean
  setCopiedKeys: (v: boolean) => void
  vars: EnvVar[]
  copyToClipboard: (text: string, setCopied: (v: boolean) => void) => void
}

export function SelectionBar({
  selectedIds,
  clearSelection,
  copiedSelected,
  setCopiedSelected,
  copiedKeys,
  setCopiedKeys,
  vars,
  copyToClipboard,
}: Props) {
  if (selectedIds.size === 0) return null

  const selected = vars.filter((v) => selectedIds.has(v.id))

  return (
    <Box
      mb="xs"
      p="xs"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        background: 'var(--mantine-color-blue-light)',
      }}
    >
      <Group gap="xs" align="center" wrap="wrap">
        <Badge size="sm" variant="filled" color="blue">
          {selectedIds.size} terpilih
        </Badge>
        <Button
          size="xs"
          variant="light"
          color="blue"
          leftSection={copiedSelected ? <TbCheck size={12} /> : <TbCopy size={12} />}
          onClick={() => copyToClipboard(toEnvText(selected), setCopiedSelected)}
        >
          {copiedSelected ? 'Tersalin!' : 'Copy .env'}
        </Button>
        <Tooltip label="Salin hanya key (KEY=) — untuk dibagikan tanpa value">
          <Button
            size="xs"
            variant="light"
            color="grape"
            leftSection={copiedKeys ? <TbCheck size={12} /> : <TbKey size={12} />}
            onClick={() => copyToClipboard(toKeyTemplate(selected), setCopiedKeys)}
          >
            {copiedKeys ? 'Tersalin!' : 'Copy keys'}
          </Button>
        </Tooltip>
        <Button size="xs" variant="subtle" color="gray" onClick={clearSelection} leftSection={<TbX size={11} />}>
          Batal
        </Button>
      </Group>
    </Box>
  )
}
