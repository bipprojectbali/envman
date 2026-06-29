import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import { TbBrandDocker, TbChevronLeft, TbChevronRight, TbHistory } from 'react-icons/tb'
import { PortainerSync } from '@/frontend/components/PortainerSync'

interface Props {
  slug: string
  env: string
  projectName: string
  portainerData: any
  historyData: any
  canEdit: boolean
  secretCount: number
  closeIntegrations: () => void
  openPortainerSetup: (mode: 'new' | 'edit') => void
}

export function IntegrationsPage({
  slug,
  env,
  projectName,
  portainerData,
  historyData,
  canEdit,
  secretCount,
  closeIntegrations,
  openPortainerSetup,
}: Props) {
  return (
    <Paper withBorder p="md" radius="md">
      <Box>
        <Group gap={6} align="center" p={'md'}>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeIntegrations}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeIntegrations}>
            {projectName}
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeIntegrations}>
            {env}
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>
            Integrasi
          </Text>
        </Group>
        <Divider />

        <Stack gap="md" p={'md'}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <TbBrandDocker size={18} style={{ color: 'var(--mantine-color-cyan-6)', flexShrink: 0 }} />
              <Box>
                <Text size="sm" fw={600} lh={1.2}>
                  Portainer
                </Text>
                <Text size="xs" c="dimmed" lh={1.4}>
                  Push env vars ke Docker stack
                </Text>
              </Box>
            </Group>
            <Badge size="xs" variant="dot" color={portainerData?.config ? 'teal' : 'gray'}>
              {portainerData?.config ? 'Tersambung' : 'Belum tersambung'}
            </Badge>
          </Group>
          <PortainerSync
            slug={slug}
            env={env}
            canEdit={canEdit}
            secretCount={secretCount}
            onSetupOpen={openPortainerSetup}
          />
        </Stack>

        {portainerData?.config && (
          <Stack gap="xs">
            <Group gap="xs" align="center">
              <TbHistory size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                Riwayat Sync
              </Text>
              {historyData?.logs?.length > 0 && (
                <Badge size="xs" variant="outline" color="gray">
                  {historyData.logs.length}
                </Badge>
              )}
            </Group>
            {!historyData ? (
              <Group justify="center" py="sm">
                <Loader size="xs" />
              </Group>
            ) : historyData.logs?.length === 0 ? (
              <Text size="xs" c="dimmed" py={4}>
                Belum ada riwayat sync.
              </Text>
            ) : (
              <Stack gap={4}>
                {(historyData.logs as any[]).map((log: any) => (
                  <Group
                    key={log.id}
                    gap="xs"
                    wrap="nowrap"
                    align="flex-start"
                    py={6}
                    style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                  >
                    <Box
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        marginTop: 6,
                        flexShrink: 0,
                        background: log.ok ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-red-5)',
                      }}
                    />
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6} wrap="wrap">
                        <Badge size="xs" color={log.ok ? 'teal' : 'red'} variant="light">
                          {log.ok ? 'Berhasil' : 'Gagal'}
                        </Badge>
                        <Badge size="xs" variant="outline" color="gray">
                          {log.triggeredBy === 'auto' ? 'auto' : 'manual'}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {log.varsCount} vars
                        </Text>
                        {log.durationMs && (
                          <Text size="xs" c="dimmed">
                            {log.durationMs}ms
                          </Text>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" mt={2}>
                        {new Date(log.createdAt).toLocaleString('id-ID')}
                        {log.user && ` · ${log.user.name}`}
                      </Text>
                      {log.error && (
                        <Text size="xs" c="red" mt={2}>
                          {log.error}
                        </Text>
                      )}
                    </Box>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        )}

        <Text size="xs" c="dimmed">
          Integrasi lain (Vault, Doppler, Kubernetes) akan tersedia di rilis berikutnya.
        </Text>
      </Box>
    </Paper>
  )
}
