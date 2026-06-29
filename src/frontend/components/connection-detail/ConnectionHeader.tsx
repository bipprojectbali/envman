import { ActionIcon, Anchor, Badge, Group, Loader, Text } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { TbChevronLeft, TbExternalLink, TbPlugConnected, TbRefresh } from 'react-icons/tb'

interface Props {
  connection: { name: string; portainerUrl: string }
  isFetching: boolean
  stackCount: number
  refetch: () => void
}

export function ConnectionHeader({ connection, isFetching, stackCount, refetch }: Props) {
  const navigate = useNavigate()

  return (
    <Group justify="space-between" mb="lg" wrap="nowrap">
      <Group gap="xs" style={{ minWidth: 0 }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={() => navigate({ to: '/envmanager/connections', search: { tab: 'connections', connectionForm: undefined } } as any)}
        >
          <TbChevronLeft size={16} />
        </ActionIcon>
        <TbPlugConnected size={20} style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }} />
        <Text fw={700} size="lg" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {connection.name}
        </Text>
        <Anchor
          href={connection.portainerUrl}
          target="_blank"
          size="xs"
          c="dimmed"
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          {connection.portainerUrl.replace(/https?:\/\//, '')}
          <TbExternalLink size={11} />
        </Anchor>
      </Group>
      <Group gap="xs" style={{ flexShrink: 0 }}>
        {isFetching && <Loader size="xs" />}
        <Badge size="sm" variant="light" color="blue">
          {stackCount} stacks
        </Badge>
        <ActionIcon variant="subtle" color="gray" size="sm" loading={isFetching} onClick={() => refetch()}>
          <TbRefresh size={15} />
        </ActionIcon>
      </Group>
    </Group>
  )
}
