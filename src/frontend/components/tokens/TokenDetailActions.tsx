import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { TbCheck, TbCopy, TbPencil, TbRefresh, TbToggleLeft, TbToggleRight, TbTrash } from 'react-icons/tb'

interface TokenDetailActionsProps {
  isDisabled: boolean
  isCopied: boolean
  togglePending: boolean
  copyPending: boolean
  rotatePending: boolean
  onToggle: () => void
  onCopy: () => void
  onRotate: () => void
  onEdit: () => void
  onRevoke: () => void
}

export function TokenDetailActions({
  isDisabled,
  isCopied,
  togglePending,
  copyPending,
  rotatePending,
  onToggle,
  onCopy,
  onRotate,
  onEdit,
  onRevoke,
}: TokenDetailActionsProps) {
  return (
    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
      <Tooltip label={isDisabled ? 'Aktifkan' : 'Nonaktifkan'} withArrow>
        <ActionIcon
          variant="light"
          size="md"
          color={isDisabled ? 'gray' : 'teal'}
          loading={togglePending}
          onClick={onToggle}
        >
          {isDisabled ? <TbToggleLeft size={16} /> : <TbToggleRight size={16} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label={isCopied ? 'Tersalin!' : 'Copy token value'} withArrow>
        <ActionIcon
          variant="light"
          size="md"
          color={isCopied ? 'teal' : 'blue'}
          loading={copyPending}
          onClick={onCopy}
        >
          {isCopied ? <TbCheck size={15} /> : <TbCopy size={15} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Edit" withArrow>
        <ActionIcon variant="light" size="md" color="gray" onClick={onEdit}>
          <TbPencil size={15} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Rotate token" withArrow>
        <ActionIcon variant="light" size="md" color="yellow" loading={rotatePending} onClick={onRotate}>
          <TbRefresh size={15} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Revoke token" withArrow>
        <ActionIcon variant="light" size="md" color="red" onClick={onRevoke}>
          <TbTrash size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
