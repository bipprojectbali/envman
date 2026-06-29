import { ActionIcon, Tooltip } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { TbCopy, TbCopyCheck } from 'react-icons/tb'

export type FileStatus = 'ok' | 'warning' | 'critical'

export interface FileEntry {
  path: string
  category: string
  lines: number
  chars: number
  maxLines: number
  maxChars: number
  linePercent: number
  charPercent: number
  status: FileStatus
}

export interface FileHealthData {
  files: FileEntry[]
  summary: { total: number; ok: number; warning: number; critical: number }
}

export function CopyRowIcon({ text }: { text: string }) {
  const cb = useClipboard({ timeout: 1500 })
  return (
    <Tooltip label={cb.copied ? 'Copied!' : 'Copy path'} withArrow>
      <ActionIcon
        size="xs"
        variant="subtle"
        color={cb.copied ? 'green' : 'gray'}
        onClick={(e) => {
          e.stopPropagation()
          cb.copy(text)
        }}
      >
        {cb.copied ? <TbCopyCheck size={12} /> : <TbCopy size={12} />}
      </ActionIcon>
    </Tooltip>
  )
}
