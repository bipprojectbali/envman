import {
  ActionIcon,
  Badge,
  CopyButton,
  Group,
  RingProgress,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  TbCheck,
  TbCopy,
  TbLock,
  TbLockOpen,
  TbToggleLeft,
  TbVariable,
} from 'react-icons/tb'
import type { FilterType } from '@/frontend/types/env'

interface Props {
  varCount: number
  isMobile: boolean | undefined
  plainCount: number
  secretCount: number
  disabledCount: number
  filterType: FilterType
  setFilterType: React.Dispatch<React.SetStateAction<FilterType>>
  filterDisabled: 'all' | 'active' | 'disabled'
  setFilterDisabled: React.Dispatch<React.SetStateAction<'all' | 'active' | 'disabled'>>
  cliCommand: string
}

export function VarsStats({
  varCount,
  isMobile,
  plainCount,
  secretCount,
  disabledCount,
  filterType,
  setFilterType,
  filterDisabled,
  setFilterDisabled,
  cliCommand,
}: Props) {
  if (varCount === 0) return null

  return (
    <Stack gap={4} mb="sm">
      <Group gap="xs" wrap="wrap" align="center">
        <Group gap={4} align="center" wrap="nowrap">
          <ThemeIcon size={18} variant="light" color="blue" radius="sm">
            <TbVariable size={10} />
          </ThemeIcon>
          <Text size="xs" fw={700}>
            {varCount}
          </Text>
          <Text size="xs" c="dimmed">
            var
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          ·
        </Text>
        <Badge
          size="sm"
          variant={filterType === 'plain' ? 'filled' : 'light'}
          color="gray"
          leftSection={<TbLockOpen size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() => setFilterType((f) => (f === 'plain' ? 'all' : 'plain'))}
        >
          {plainCount} plain
        </Badge>
        <Badge
          size="sm"
          variant={filterType === 'secret' ? 'filled' : 'light'}
          color="red"
          leftSection={<TbLock size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() => setFilterType((f) => (f === 'secret' ? 'all' : 'secret'))}
        >
          {secretCount} secret
        </Badge>
        {disabledCount > 0 && (
          <Badge
            size="sm"
            variant={filterDisabled === 'disabled' ? 'filled' : 'light'}
            color="orange"
            leftSection={<TbToggleLeft size={10} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setFilterDisabled((f) => (f === 'disabled' ? 'all' : 'disabled'))}
          >
            {disabledCount} off
          </Badge>
        )}
        {!isMobile && varCount > 0 && (
          <>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Group gap={4} wrap="nowrap" align="center">
              <RingProgress
                size={20}
                thickness={2}
                sections={[
                  { value: (plainCount / varCount) * 100, color: 'var(--mantine-color-gray-5)' },
                  { value: (secretCount / varCount) * 100, color: 'var(--mantine-color-red-5)' },
                ]}
              />
              <Text size="xs" c="dimmed">
                {plainCount}p/{secretCount}s
              </Text>
            </Group>
          </>
        )}
      </Group>
      <Group p={'sm'} gap={4} wrap="nowrap" align="center" maw={540} bg="dark.5" style={{ borderRadius: 8 }}>
        <Text fz={10} style={{ flex: 1, wordBreak: 'break-all' }}>
          {cliCommand}
        </Text>
        <CopyButton value={cliCommand}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy CLI'}>
              <ActionIcon
                size="xs"
                variant="subtle"
                color={copied ? 'teal' : 'gray'}
                onClick={copy}
                style={{ flexShrink: 0 }}
              >
                {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Stack>
  )
}
