import {
  ActionIcon,
  Badge,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useMutation } from '@tanstack/react-query'
import { TbCopy, TbCopyCheck, TbRefresh, TbToggleLeft, TbToggleRight, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

export interface Token {
  id: string
  name: string
  scopes: string[]
  tags: string[]
  canWrite: boolean
  isDisabled: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export function tokenStatus(t: Token) {
  if (t.isDisabled) return { label: 'Disabled', color: 'gray' }
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return { label: 'Expired', color: 'red' }
  return { label: 'Active', color: 'green' }
}

export function RevealButton({ id }: { id: string }) {
  const cb = useClipboard({ timeout: 2000 })
  const reveal = useMutation({
    mutationFn: () => apiFetch<{ token: string }>(`/api/envman/tokens/${id}/reveal`),
    onSuccess: (d) => cb.copy(d.token),
  })
  return (
    <Tooltip label={cb.copied ? 'Token disalin!' : 'Copy token'} withArrow>
      <ActionIcon size="sm" variant="subtle" color={cb.copied ? 'green' : 'gray'} loading={reveal.isPending} onClick={() => reveal.mutate()}>
        {cb.copied ? <TbCopyCheck size={14} /> : <TbCopy size={14} />}
      </ActionIcon>
    </Tooltip>
  )
}

export function TokenActions({ t, toggle, rotate, remove }: { t: Token; toggle: (id: string) => void; rotate: (id: string) => void; remove: (id: string) => void }) {
  return (
    <Group gap={4} wrap="nowrap">
      <RevealButton id={t.id} />
      <Tooltip label={t.isDisabled ? 'Enable' : 'Disable'} withArrow>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => toggle(t.id)}>
          {t.isDisabled ? <TbToggleLeft size={14} /> : <TbToggleRight size={14} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Rotate" withArrow>
        <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => rotate(t.id)}>
          <TbRefresh size={14} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Hapus" withArrow>
        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove(t.id)}>
          <TbTrash size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

export function TokenRow({ t, toggle, rotate, remove }: { t: Token; toggle: (id: string) => void; rotate: (id: string) => void; remove: (id: string) => void }) {
  const st = tokenStatus(t)
  return (
    <Stack gap={4} py={8} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group justify="space-between" wrap="wrap" align="flex-start" gap="xs">
        <Group gap="xs" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} style={{ wordBreak: 'break-all' }}>{t.name}</Text>
          <Badge size="xs" color={st.color} variant="light">{st.label}</Badge>
          {t.canWrite && <Badge size="xs" color="orange" variant="light">R/W</Badge>}
        </Group>
        <TokenActions t={t} toggle={toggle} rotate={rotate} remove={remove} />
      </Group>
      <Text size="xs" c="dimmed">
        Dibuat: {new Date(t.createdAt).toLocaleDateString('id-ID')}
        {t.expiresAt ? ` · Exp: ${new Date(t.expiresAt).toLocaleDateString('id-ID')}` : ''}
        {t.lastUsedAt ? ` · Dipakai: ${new Date(t.lastUsedAt).toLocaleDateString('id-ID')}` : ''}
      </Text>
      {t.tags.length > 0 && (
        <Group gap={4}>
          {t.tags.map((tag) => <Badge key={tag} size="xs" variant="dot" color="blue">{tag}</Badge>)}
        </Group>
      )}
    </Stack>
  )
}

export function TokenCard({ t, toggle, rotate, remove }: { t: Token; toggle: (id: string) => void; rotate: (id: string) => void; remove: (id: string) => void }) {
  const st = tokenStatus(t)
  return (
    <Card padding="sm" withBorder>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600} truncate style={{ flex: 1 }}>{t.name}</Text>
          <Badge size="xs" color={st.color} variant="light">{st.label}</Badge>
        </Group>
        {t.canWrite && <Badge size="xs" color="orange" variant="light" w="fit-content">Read-Write</Badge>}
        <Text size="xs" c="dimmed">
          Dibuat: {new Date(t.createdAt).toLocaleDateString('id-ID')}
          {t.expiresAt ? (<><br />Exp: {new Date(t.expiresAt).toLocaleDateString('id-ID')}</>) : ''}
        </Text>
        {t.tags.length > 0 && (
          <Group gap={4}>
            {t.tags.map((tag) => <Badge key={tag} size="xs" variant="dot" color="blue">{tag}</Badge>)}
          </Group>
        )}
        <Divider />
        <TokenActions t={t} toggle={toggle} rotate={rotate} remove={remove} />
      </Stack>
    </Card>
  )
}
