import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Indicator,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  TbAlertTriangle,
  TbChevronRight,
  TbHome,
  TbPlugConnected,
  TbRefresh,
  TbShieldLock,
} from 'react-icons/tb'

interface Props {
  slug: string
  env: string
  isMobile: boolean | undefined
  onNavToRoot: () => void
  onNavToProject: () => void
  portainerEnabled: boolean
  portainerData: any
  isFetching: boolean
  refetch: () => void
  openIntegrations: () => void
  encryptionEnabled: boolean
}

export function VarsPageBreadcrumb({
  slug,
  env,
  isMobile,
  onNavToRoot,
  onNavToProject,
  portainerEnabled,
  portainerData,
  isFetching,
  refetch,
  openIntegrations,
  encryptionEnabled,
}: Props) {
  return (
    <Group mb="md" justify="space-between" align="center" gap="xs" wrap="nowrap">
      {/* Kiri: breadcrumb navigasi */}
      <Group gap={4} align="center" style={{ minWidth: 0, flex: 1 }}>
        <Anchor
          size="xs"
          c="dimmed"
          onClick={onNavToRoot}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
        >
          <TbHome size={12} />
          {!isMobile && 'Projects'}
        </Anchor>
        <TbChevronRight size={12} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
        <Anchor
          size="xs"
          c="dimmed"
          onClick={onNavToProject}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: isMobile ? 80 : 160,
          }}
        >
          {slug}
        </Anchor>
        <TbChevronRight size={12} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
        <Badge size="sm" variant="filled" color="blue" radius="sm" style={{ flexShrink: 0 }}>
          {env}
        </Badge>
      </Group>

      {/* Kanan: status badge + integrations + refresh */}
      <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
        <Tooltip label={encryptionEnabled ? 'AES-256-GCM aktif' : 'MASTER_KEY belum di-set — plaintext mode'}>
          <Badge
            size="sm"
            variant={encryptionEnabled ? 'light' : 'dot'}
            color={encryptionEnabled ? 'teal' : 'orange'}
            leftSection={encryptionEnabled ? <TbShieldLock size={11} /> : <TbAlertTriangle size={11} />}
            style={{ cursor: 'default' }}
          >
            {isMobile ? (encryptionEnabled ? 'AES' : '!') : encryptionEnabled ? 'Encrypted' : 'Plaintext'}
          </Badge>
        </Tooltip>

        {portainerEnabled && (
          <Tooltip
            label={
              portainerData?.config
                ? `Portainer tersambung${portainerData.unsyncedCount > 0 ? ` · ${portainerData.unsyncedCount} belum di-sync` : ''}`
                : 'Sambungkan ke Portainer (opsional)'
            }
          >
            <Indicator
              color={portainerData?.config ? (portainerData.unsyncedCount > 0 ? 'orange' : 'teal') : 'gray'}
              size={8}
              offset={4}
              processing={!!portainerData?.config && portainerData.unsyncedCount > 0}
              disabled={!portainerData?.config}
            >
              <Group>
                <Button
                  size="compact-xs"
                  variant={portainerData?.config ? 'light' : 'subtle'}
                  color={portainerData?.config ? 'cyan' : 'gray'}
                  leftSection={<TbPlugConnected size={12} />}
                  onClick={openIntegrations}
                  px={isMobile ? 6 : 8}
                >
                  {isMobile ? '' : 'Integrasi'}
                </Button>
              </Group>
            </Indicator>
          </Tooltip>
        )}

        <Tooltip label="Refresh">
          <ActionIcon size="sm" variant="subtle" color="gray" loading={isFetching} onClick={() => refetch()}>
            <TbRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
