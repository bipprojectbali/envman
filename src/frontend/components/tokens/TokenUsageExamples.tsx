import { ActionIcon, Box, Button, Code, Divider, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbCheck, TbCopy, TbKey } from 'react-icons/tb'
import type { ApiToken } from './token-utils'

interface Props {
  token: ApiToken
  isCopied: boolean
  copyPending: boolean
  accentColor: string
  onCopy: () => void
  onCopyCommand: (cmdTemplate: string) => void
}

export function TokenUsageExamples({ token, isCopied, copyPending, accentColor, onCopy, onCopyCommand }: Props) {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)

  const handleCopyCmd = (label: string, cmdTemplate: string) => {
    onCopyCommand(cmdTemplate)
    setCopiedCmd(label)
    setTimeout(() => setCopiedCmd((prev) => (prev === label ? null : prev)), 1500)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const scope = token.scopes.length > 0 ? token.scopes[0] : 'myapp:production'
  const [scopeProject, scopeEnv] = scope.includes(':') ? scope.split(':') : [scope, 'production']
  const commands = [
    { label: 'Login & simpan config', cmd: `envman login ${origin} --token [TOKEN]` },
    { label: `Inject vars (${scopeProject}:${scopeEnv})`, cmd: `envman -e ${scopeProject}:${scopeEnv} -- bun start` },
    {
      label: 'CI/CD tanpa login',
      cmd: `ENVMAN_SERVER=${origin} ENVMAN_TOKEN=[TOKEN] envman -e ${scopeProject}:${scopeEnv} -- bun start`,
    },
  ]

  return (
    <Box>
      <Group gap="xs" mb="sm">
        <ThemeIcon size={20} radius="sm" variant="light" color="gray"><TbKey size={11} /></ThemeIcon>
        <Text size="sm" fw={600}>Cara Penggunaan</Text>
      </Group>
      {token.scopes.length === 0 && (
        <Text size="xs" c="dimmed" mb="sm">
          Ganti <Code fz="xs">myapp:production</Code> dengan project:env yang sesuai.
        </Text>
      )}
      <Stack gap="sm">
        {commands.map(({ label, cmd }) => (
          <Box key={label}>
            <Text size="xs" c="dimmed" mb={4} fw={500}>{label}</Text>
            <Group gap={6} align="center">
              <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
              <Tooltip label={copiedCmd === label ? 'Copied!' : 'Copy'}>
                <ActionIcon size="sm" variant="subtle" color={copiedCmd === label ? 'teal' : 'gray'}
                  onClick={() => handleCopyCmd(label, cmd)}>
                  {copiedCmd === label ? <TbCheck size={12} /> : <TbCopy size={12} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Box>
        ))}
      </Stack>
      <Divider my="sm" />
      <Button
        size="xs" variant="light" color={accentColor}
        leftSection={isCopied ? <TbCheck size={13} /> : <TbCopy size={13} />}
        loading={copyPending}
        onClick={onCopy}
      >
        {isCopied ? 'Token tersalin!' : 'Copy nilai token'}
      </Button>
    </Box>
  )
}
