import { ActionIcon, Anchor, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { TbChevronLeft, TbChevronRight } from 'react-icons/tb'

interface Props {
  title: string
  onBack: () => void
  children: ReactNode
}

export function FormPageShell({ title, onBack, children }: Props) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onBack}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={onBack}>
            Projects
          </Anchor>
          <TbChevronRight size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>{title}</Text>
        </Group>
        <Divider />
        {children}
      </Stack>
    </Paper>
  )
}
