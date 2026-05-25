import { Box, Container, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { ComponentType } from 'react'

export function PlaceholderPanel({
  title,
  desc,
  icon: Icon,
}: {
  title: string
  desc: string
  icon: ComponentType<{ size: number }>
}) {
  return (
    <Container size="lg">
      <Stack align="center" justify="center" gap="md" mih={400}>
        <ThemeIcon size={64} variant="light" color="gray" radius="xl">
          <Icon size={32} />
        </ThemeIcon>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" ta="center" maw={400}>
          {desc}
        </Text>
      </Stack>
    </Container>
  )
}
