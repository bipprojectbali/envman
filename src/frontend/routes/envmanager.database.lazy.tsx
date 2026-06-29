import { Alert, Divider, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { createLazyFileRoute } from '@tanstack/react-router'
import { TbAlertTriangle, TbDatabase } from 'react-icons/tb'
import { GenerateTokenSection } from '@/frontend/components/database/GenerateTokenSection'
import { SyncFromSection } from '@/frontend/components/database/SyncFromSection'

export const Route = createLazyFileRoute('/envmanager/database')({
  component: DatabasePage,
})

function DatabasePage() {
  return (
    <Stack gap="lg" p="md" maw={700} mx="auto">
      <Group gap="sm">
        <ThemeIcon size={36} variant="gradient" radius="md">
          <TbDatabase size={20} />
        </ThemeIcon>
        <div>
          <Text fw={700} size="lg">
            Database Sync
          </Text>
          <Text size="sm" c="dimmed">
            Kloning data dari instance remote (staging) ke local dev.
          </Text>
        </div>
      </Group>

      <Alert icon={<TbAlertTriangle size={18} />} color="yellow" variant="light">
        <Text size="sm">
          Operasi ini <b>destructive</b>: data local akan ditimpa total oleh data dari remote. Pakai hanya untuk
          debugging dengan real data. Setelah sync, kamu perlu login ulang.
        </Text>
      </Alert>

      <GenerateTokenSection />
      <Divider label="atau" labelPosition="center" />
      <SyncFromSection />
    </Stack>
  )
}
