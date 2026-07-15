import { Box, Group } from '@mantine/core'
import type { ReactNode } from 'react'

/**
 * A stylized terminal window (traffic-light header + dark body). Static content
 * only — used for hero + CLI showcase. Colors are literal because a terminal is
 * conventionally dark in both themes.
 */
export function MockTerminal({
  title = 'zsh',
  children,
  minH,
}: {
  title?: string
  children: ReactNode
  minH?: number
}) {
  return (
    <Box
      style={{
        background: '#0c0c0f',
        border: '1px solid #26262b',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px -20px rgba(0,0,0,0.55)',
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Courier New', monospace",
      }}
    >
      <Group gap={7} px={14} py={10} style={{ borderBottom: '1px solid #1c1c21', background: '#141418' }}>
        <Box w={11} h={11} style={{ borderRadius: '50%', background: '#ff5f57' }} />
        <Box w={11} h={11} style={{ borderRadius: '50%', background: '#febc2e' }} />
        <Box w={11} h={11} style={{ borderRadius: '50%', background: '#28c840' }} />
        <Box style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#6b6b73', letterSpacing: 0.3 }}>{title}</Box>
      </Group>
      <Box p={16} style={{ fontSize: 12.5, lineHeight: 1.85, color: '#d4d4d8', minHeight: minH, overflowX: 'auto' }}>
        {children}
      </Box>
    </Box>
  )
}

/** A shell prompt line: `$ command`. */
export function Cmd({ children }: { children: ReactNode }) {
  return (
    <Box style={{ whiteSpace: 'pre' }}>
      <Box component="span" style={{ color: '#7c5cff', userSelect: 'none' }}>
        ${' '}
      </Box>
      <Box component="span" style={{ color: '#e8e8ea' }}>
        {children}
      </Box>
    </Box>
  )
}

/** A dimmed output line under a command. */
export function Out({ children, color }: { children: ReactNode; color?: string }) {
  return <Box style={{ whiteSpace: 'pre', color: color ?? '#6b6b73' }}>{children}</Box>
}

/** A comment line (`# ...`). */
export function Comment({ children }: { children: ReactNode }) {
  return <Box style={{ whiteSpace: 'pre', color: '#4a4a52' }}># {children}</Box>
}
