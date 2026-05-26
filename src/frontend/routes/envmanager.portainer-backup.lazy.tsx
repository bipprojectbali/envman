import { Box, Container, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { createLazyFileRoute } from '@tanstack/react-router'
import { TbDatabaseExport } from 'react-icons/tb'
import { BackupPanelContent } from '@/frontend/components/dev/PortainerBackupPanel'

export const Route = createLazyFileRoute('/envmanager/portainer-backup')({
  component: PortainerBackupPage,
})

function PortainerBackupPage() {
  return (
    <Container size="md">
      <Stack gap="lg">
        <Group gap="sm">
          <ThemeIcon size={44} variant="light" color="cyan" radius="md">
            <TbDatabaseExport size={22} />
          </ThemeIcon>
          <Box>
            <Title order={3}>Portainer Backup</Title>
            <Text size="sm" c="dimmed">Backup database dan compose files dari Portainer connections.</Text>
          </Box>
        </Group>
        <BackupPanelContent />
      </Stack>
    </Container>
  )
}
