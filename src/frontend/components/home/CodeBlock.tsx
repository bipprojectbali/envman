import { Box, Button, Group, Text, Tooltip } from '@mantine/core'
import { TbCheck, TbCopy } from 'react-icons/tb'
import { CopyButton } from '@mantine/core'

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <Box>
      {label && <Text size="xs" c="dimmed" mb={4}>{label}</Text>}
      <Group gap={6} align="flex-start">
        <Box style={{ flex: 1, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 6, padding: '10px 14px', fontFamily: "'Courier New', Courier, monospace", fontSize: 12, lineHeight: 1.7, color: '#c9d1d9', overflowX: 'auto', whiteSpace: 'pre' }}>
          {code}
        </Box>
        <CopyButton value={code}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy'}>
              <Button size="compact-xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} mt={6} px={6}>
                {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Box>
  )
}
