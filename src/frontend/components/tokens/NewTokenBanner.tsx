import { ActionIcon, Alert, Box, Code, CopyButton, Divider, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { TbAlertTriangle, TbCheck, TbCopy, TbX } from 'react-icons/tb'

interface Props {
  token: string
  onDismiss: () => void
}

export function NewTokenBanner({ token, onDismiss }: Props) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const usageExamples = [
    { label: 'Login & simpan config', cmd: `envman login ${origin} --token ${token}` },
    { label: 'Inject vars ke command', cmd: `envman -e myapp:production -- bun start` },
    { label: 'CI/CD (tanpa login)', cmd: `ENVMAN_SERVER=${origin} ENVMAN_TOKEN=${token} envman -e myapp:production -- bun start` },
  ]

  return (
    <Box
      mb="md"
      p="md"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-teal-5)',
        position: 'relative',
      }}
    >
      <ActionIcon
        size="xs"
        variant="subtle"
        color="gray"
        style={{ position: 'absolute', top: 8, right: 8 }}
        onClick={onDismiss}
      >
        <TbX size={12} />
      </ActionIcon>
      <Group gap="xs" mb="xs">
        <ThemeIcon size="sm" radius="xl" color="teal" variant="light">
          <TbCheck size={12} />
        </ThemeIcon>
        <Text size="xs" fw={600} c="teal">Token berhasil dibuat — simpan sekarang!</Text>
      </Group>
      <Alert color="orange" p="xs" mb="xs" icon={<TbAlertTriangle size={12} />}>
        <Text size="xs">Nilai token hanya ditampilkan <strong>sekali ini saja</strong> dan tidak bisa dilihat lagi.</Text>
      </Alert>
      <Group gap="xs" mb="xs">
        <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{token}</Code>
        <CopyButton value={token}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy token'}>
              <ActionIcon size="sm" variant="filled" color={copied ? 'teal' : 'blue'} onClick={copy}>
                {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      <Divider mb="xs" />
      <Text size="xs" c="dimmed" mb={6}>Cara penggunaan:</Text>
      <Stack gap={6}>
        {usageExamples.map(({ label, cmd }) => (
          <Box key={label}>
            <Text size="xs" c="dimmed" mb={2}>{label}</Text>
            <Group gap="xs">
              <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
              <CopyButton value={cmd}>
                {({ copied, copy }) => (
                  <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                    {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                  </ActionIcon>
                )}
              </CopyButton>
            </Group>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
