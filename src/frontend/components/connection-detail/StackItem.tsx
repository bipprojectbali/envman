import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import {
  TbCheck,
  TbChevronRight,
  TbFileCode,
  TbFileText,
  TbRefresh,
  TbRefreshDot,
  TbServer,
  TbTerminal2,
  TbX,
} from 'react-icons/tb'
import type { ContainerInfo, ContainerStats, StackInfo } from '@/frontend/types/portainer'
import { relTime, stateColor } from '@/frontend/types/portainer'

interface Props {
  stack: StackInfo
  view: 'grid' | 'list'
  stackContainers: ContainerInfo[]
  stackFetching: boolean
  containerStatsMap?: Record<string, ContainerStats | undefined>
  canMutate: boolean
  canOperate: boolean
  repull: { isPending: boolean; variables?: unknown }
  recreate: { isPending: boolean; variables?: unknown }
  restartContainer: { isPending: boolean; variables?: any }
  onRepull: (stack: StackInfo) => void
  onRecreate: (stack: StackInfo) => void
  onRestartContainer: (stack: StackInfo, containerId: string, containerName: string) => void
  onOpenCompose: (stack: StackInfo) => void
  onOpenLogs: (stack: StackInfo, containerId: string) => void
  onOpenExec: (container: ContainerInfo, stack: StackInfo) => void
}

function ContainerRow({ c, stack, canMutate, canOperate, restartContainer, onRestartContainer, onOpenLogs, onOpenExec, stats, maxImageWidth }: {
  c: ContainerInfo
  stack: StackInfo
  canMutate: boolean
  canOperate: boolean
  restartContainer: { isPending: boolean; variables?: any }
  onRestartContainer: (stack: StackInfo, containerId: string, containerName: string) => void
  onOpenLogs: (stack: StackInfo, containerId: string) => void
  onOpenExec: (container: ContainerInfo, stack: StackInfo) => void
  stats?: ContainerStats
  maxImageWidth: number
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap="sm" style={{ minWidth: 0 }}>
        <ThemeIcon size={32} radius="md" variant="light" color={stateColor[c.state] ?? 'gray'}>
          <TbServer size={15} />
        </ThemeIcon>
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.names[0]}
          </Text>
          <Group gap="xs" mt={2} wrap="nowrap">
            <Code fz={10} c="dimmed">{c.shortId}</Code>
            <Text fz={10} c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: maxImageWidth }}>
              {c.image.split('/').pop()}
            </Text>
          </Group>
          {stats && (
            <Group gap={6} mt={2} wrap="nowrap">
              <Badge size="xs" variant="dot" color={stats.cpuPercent > 80 ? 'red' : stats.cpuPercent > 50 ? 'orange' : 'teal'}>
                CPU {stats.cpuPercent.toFixed(1)}%
              </Badge>
              <Badge size="xs" variant="dot" color={stats.memPercent > 80 ? 'red' : stats.memPercent > 50 ? 'orange' : 'blue'}>
                {stats.memUsageMB}MB
              </Badge>
            </Group>
          )}
        </Box>
      </Group>
      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        <Badge size="sm" color={stateColor[c.state] ?? 'gray'} variant="light">{c.state}</Badge>
        {c.ports.length > 0 && <Code fz={10}>{c.ports[0]}</Code>}
        {canMutate && (
          <Tooltip label="Restart container">
            <ActionIcon
              size="sm" variant="subtle" color="orange"
              loading={restartContainer.isPending && restartContainer.variables?.containerId === c.id}
              onClick={(e) => { e.stopPropagation(); onRestartContainer(stack, c.id, c.names[0]) }}
            >
              <TbRefresh size={13} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Lihat logs">
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={(e) => { e.stopPropagation(); onOpenLogs(stack, c.id) }}>
            <TbFileText size={13} />
          </ActionIcon>
        </Tooltip>
        {canOperate && (
          <Tooltip label="Exec command">
            <ActionIcon size="sm" variant="subtle" color="teal" onClick={(e) => { e.stopPropagation(); onOpenExec(c, stack) }}>
              <TbTerminal2 size={13} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  )
}

function LinkedEnvBadges({ linkedEnvs }: { linkedEnvs: StackInfo['linkedEnvs'] }) {
  if (!linkedEnvs.length) return null
  return (
    <>
      <Divider mt="xs" label={<Text size="xs" c="dimmed" fw={500}>Terhubung ke envman</Text>} labelPosition="left" />
      <Group gap="xs" wrap="wrap">
        {linkedEnvs.map((env) => (
          <Anchor key={`${env.slug}:${env.envName}`} size="xs" component={Link} to="/envmanager/$slug/$env" params={{ slug: env.slug, env: env.envName } as any}>
            <Badge
              size="sm" variant="light"
              color={env.lastSyncOk === true ? 'teal' : env.lastSyncOk === false ? 'red' : 'gray'}
              leftSection={env.lastSyncOk === true ? <TbCheck size={9} /> : env.lastSyncOk === false ? <TbX size={9} /> : undefined}
              rightSection={<TbChevronRight size={9} />}
              style={{ cursor: 'pointer' }}
            >
              {env.projectName}:{env.envName}
            </Badge>
          </Anchor>
        ))}
      </Group>
    </>
  )
}

export function StackItem({ stack, view, stackContainers, stackFetching, containerStatsMap, canMutate, canOperate, repull, recreate, restartContainer, onRepull, onRecreate, onRestartContainer, onOpenCompose, onOpenLogs, onOpenExec }: Props) {
  const runningCount = stackContainers.filter((c) => c.state === 'running').length
  const totalCount = stackContainers.length

  const stackHeader = (
    <Group justify="space-between" wrap="wrap" gap="xs">
      <Group gap="sm" style={{ minWidth: 0 }}>
        <ThemeIcon size={40} radius="md" variant="light" color={stack.status === 1 ? 'teal' : 'red'}>
          <TbServer size={20} />
        </ThemeIcon>
        <Box style={{ minWidth: 0 }}>
          <Group gap="xs" mb={4} wrap="nowrap">
            <Text fw={700} size="md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stack.name}
            </Text>
            <Badge size="xs" color={stack.status === 1 ? 'teal' : 'red'} variant="light">
              {stack.status === 1 ? 'active' : 'inactive'}
            </Badge>
            <Badge size="xs" variant="outline" color="gray">{stack.type === 2 ? 'compose' : 'swarm'}</Badge>
            <Badge size="xs" variant="dot" color="gray">ep#{stack.endpointId}</Badge>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">Diperbarui {relTime(stack.updatedAt)}</Text>
            {!stackFetching && totalCount > 0 && (
              <Badge size="xs" variant="light" color={runningCount === totalCount ? 'teal' : runningCount > 0 ? 'yellow' : 'red'}>
                {runningCount}/{totalCount} running
              </Badge>
            )}
            {stackFetching && <Loader size={10} />}
          </Group>
        </Box>
      </Group>
      <Group gap="xs" wrap="nowrap">
        {view === 'grid' && (
          <Tooltip label="Lihat & edit compose file">
            <Button size="xs" variant="subtle" color="gray" leftSection={<TbFileCode size={13} />} onClick={() => onOpenCompose(stack)}>
              Compose
            </Button>
          </Tooltip>
        )}
        {canMutate && (
          <>
            <Tooltip label="Pull image terbaru & restart">
              <Button size="xs" variant="light" color="blue" leftSection={<TbRefreshDot size={13} />}
                loading={repull.isPending && repull.variables === stack.id}
                onClick={() => onRepull(stack)}>
                Repull
              </Button>
            </Tooltip>
            <Tooltip label="Force recreate (stop→start)">
              <Button size="xs" variant="light" color="orange" leftSection={<TbRefresh size={13} />}
                loading={recreate.isPending && recreate.variables === stack.id}
                onClick={() => onRecreate(stack)}>
                Recreate
              </Button>
            </Tooltip>
          </>
        )}
      </Group>
    </Group>
  )

  const containersList = (
    <Stack gap="xs">
      {stackFetching && stackContainers.length === 0 ? (
        <Group gap="xs" py="xs"><Loader size="xs" /><Text size="xs" c="dimmed">Memuat containers...</Text></Group>
      ) : stackContainers.length === 0 ? (
        <Text size="xs" c="dimmed" py="xs">Tidak ada container di stack ini.</Text>
      ) : (
        stackContainers.map((c) => {
          const rowContent = (
            <ContainerRow
              c={c} stack={stack} canMutate={canMutate} canOperate={canOperate}
              restartContainer={restartContainer}
              onRestartContainer={onRestartContainer}
              onOpenLogs={onOpenLogs} onOpenExec={onOpenExec}
              stats={view === 'grid' ? containerStatsMap?.[c.id] : undefined}
              maxImageWidth={view === 'grid' ? 160 : 200}
            />
          )
          return view === 'grid' ? (
            <Card key={c.id} p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', cursor: 'pointer' }} onClick={() => onOpenLogs(stack, c.id)}>
              {rowContent}
            </Card>
          ) : (
            <Box key={c.id} p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }} onClick={() => onOpenLogs(stack, c.id)}>
              {rowContent}
            </Box>
          )
        })
      )}
      <LinkedEnvBadges linkedEnvs={stack.linkedEnvs} />
    </Stack>
  )

  if (view === 'grid') {
    return (
      <Paper style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
        <Box p="md">{stackHeader}</Box>
        <Box p="md">{containersList}</Box>
      </Paper>
    )
  }

  return (
    <Box style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
      <Box p="md">{stackHeader}</Box>
      <Box p="md">{containersList}</Box>
    </Box>
  )
}
