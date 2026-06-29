import {
  ActionIcon,
  Badge,
  Box,
  Container,
  Group,
  Modal,
  Pagination,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbKey, TbLayoutGrid, TbLayoutList, TbRefresh, TbSearch, TbUsers } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { TokenActivityDrawer } from './TokenActivityDrawer'
import { TokenCard } from './tokens/TokenAdminCard'
import { SetExpiryModal } from './tokens/SetExpiryModal'
import { TokensTableView } from './tokens/TokensTableView'
import { type AdminToken, type Summary } from './tokens/types'

export function TokensAdminPanel() {
  const qc = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [viewMode, setViewMode] = useState<'table' | 'card'>(
    () => (localStorage.getItem('admin:tokens:viewMode') as 'table' | 'card') ?? 'table',
  )
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(() => localStorage.getItem('admin:tokens:status') ?? 'all')
  const [groupByUser, setGroupByUser] = useState(() => localStorage.getItem('admin:tokens:groupByUser') === 'true')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [expiryTarget, setExpiryTarget] = useState<AdminToken | null>(null)
  const [expiryOpen, { open: openExpiry, close: closeExpiry }] = useDisclosure(false)
  const [activityToken, setActivityToken] = useState<AdminToken | null>(null)
  const [activityOpen, { open: openActivity, close: closeActivity }] = useDisclosure(false)

  const { data, isLoading, refetch } = useQuery<{ tokens: AdminToken[]; summary: Summary }>({
    queryKey: ['admin', 'tokens', status],
    queryFn: () => apiFetch(`/api/admin/tokens?status=${status}&limit=500`),
  })

  const toggleDisableMut = useMutation({
    mutationFn: ({ id, isDisabled }: { id: string; isDisabled: boolean }) =>
      apiFetch(`/api/admin/tokens/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: isDisabled ? 'enable' : 'disable' }),
      }),
    onSuccess: (_, { isDisabled }) => {
      notifyOk(isDisabled ? 'Token diaktifkan' : 'Token dinonaktifkan')
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] })
    },
    onError: (e) => notifyErr(e),
  })
  const revokeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notifyOk('Token dihapus')
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] })
    },
    onError: (e) => notifyErr(e),
  })

  const doToggle = (id: string, isDisabled: boolean) => toggleDisableMut.mutate({ id, isDisabled })
  const doRevoke = (t: AdminToken) =>
    modals.openConfirmModal({
      title: 'Hapus Token Permanen',
      children: (
        <Text size="sm">
          Token <strong>{t.name}</strong> milik <strong>{t.user.email}</strong> akan dihapus permanen.
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => revokeMut.mutate(t.id),
    })
  const doExpiry = (t: AdminToken) => {
    setExpiryTarget(t)
    openExpiry()
  }
  const openTokenActivity = (t: AdminToken) => {
    setActivityToken(t)
    openActivity()
  }

  const s = data?.summary
  const filtered = (data?.tokens ?? []).filter((t) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.user.name.toLowerCase().includes(q) ||
      t.user.email.toLowerCase().includes(q)
    )
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const groups = groupByUser
    ? Object.values(
        paged.reduce<Record<string, { userId: string; name: string; email: string; tokens: AdminToken[] }>>(
          (acc, t) => {
            if (!acc[t.user.id])
              acc[t.user.id] = { userId: t.user.id, name: t.user.name, email: t.user.email, tokens: [] }
            acc[t.user.id].tokens.push(t)
            return acc
          },
          {},
        ),
      )
    : [{ userId: '', name: '', email: '', tokens: paged }]

  const commonActionProps = {
    toggleDisable: doToggle,
    revoke: doRevoke,
    revokeLoading: revokeMut.isPending,
    toggleLoading: toggleDisableMut.isPending,
  }

  return (
    <Container size="xl" p={0}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Group gap="xs">
            <TbKey size={22} />
            <Title order={3}>Token Control</Title>
          </Group>
          {s && (
            <Group gap="xs" wrap="wrap">
              <Badge color="gray" variant="light">{s.total} Total</Badge>
              <Badge color="green" variant="light">{s.active} Active</Badge>
              <Badge color="orange" variant="light">{s.disabled} Disabled</Badge>
              <Badge color="red" variant="light">{s.expired} Expired</Badge>
              <ActionIcon variant="subtle" color="gray" onClick={() => refetch()}>
                <TbRefresh size={16} />
              </ActionIcon>
            </Group>
          )}
        </Group>

        <Stack gap="xs">
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="Cari nama token atau user..."
              leftSection={<TbSearch size={13} />}
              value={search}
              onChange={(e) => { setSearch(e.currentTarget.value); setPage(1) }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Kelompokkan by user" withArrow>
                <ActionIcon
                  size="sm"
                  variant={groupByUser ? 'light' : 'subtle'}
                  color={groupByUser ? 'blue' : 'gray'}
                  onClick={() => setGroupByUser((v) => { const n = !v; localStorage.setItem('admin:tokens:groupByUser', String(n)); return n })}
                >
                  <TbUsers size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Table view" withArrow>
                <ActionIcon
                  size="sm"
                  variant={viewMode === 'table' ? 'light' : 'subtle'}
                  color={viewMode === 'table' ? 'blue' : 'gray'}
                  onClick={() => { setViewMode('table'); localStorage.setItem('admin:tokens:viewMode', 'table') }}
                >
                  <TbLayoutList size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Card view" withArrow>
                <ActionIcon
                  size="sm"
                  variant={viewMode === 'card' ? 'light' : 'subtle'}
                  color={viewMode === 'card' ? 'blue' : 'gray'}
                  onClick={() => { setViewMode('card'); localStorage.setItem('admin:tokens:viewMode', 'card') }}
                >
                  <TbLayoutGrid size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <SegmentedControl
            size="xs"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); localStorage.setItem('admin:tokens:status', v) }}
            data={[
              { value: 'all', label: 'Semua' },
              { value: 'active', label: 'Active' },
              { value: 'disabled', label: 'Disabled' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
        </Stack>

        {isLoading ? (
          <Text c="dimmed" size="sm">Loading...</Text>
        ) : isMobile || viewMode === 'card' ? (
          <Stack gap="sm">
            {groups.map((g) => (
              <Box key={g.userId || 'all'}>
                {groupByUser && g.name && (
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4} style={{ letterSpacing: '0.05em' }}>
                    {g.name}{' '}
                    <Text span c="dimmed" fw={400}>({g.email})</Text>{' '}
                    <Badge size="xs" variant="light" color="gray">{g.tokens.length}</Badge>
                  </Text>
                )}
                <Stack gap="xs">
                  {g.tokens.map((t) => (
                    <Box key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTokenActivity(t)}>
                      <TokenCard t={t} onExpiry={() => doExpiry(t)} {...commonActionProps} />
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
            {paged.length === 0 && (
              <Text c="dimmed" size="xs" ta="center" py="md">Tidak ada token ditemukan.</Text>
            )}
          </Stack>
        ) : (
          <TokensTableView
            groups={groups}
            groupByUser={groupByUser}
            commonActionProps={commonActionProps}
            onExpiry={doExpiry}
            onActivityClick={openTokenActivity}
          />
        )}

        {filtered.length > 0 && (
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed">{filtered.length} token · hal {page}/{totalPages}</Text>
              <Select
                size="xs"
                w={80}
                value={String(pageSize)}
                onChange={(v) => { setPageSize(Number(v)); setPage(1) }}
                data={['10', '25', '50', '100']}
                allowDeselect={false}
              />
              <Text size="xs" c="dimmed">/ hal</Text>
            </Group>
            <Pagination value={page} onChange={setPage} total={totalPages} size="xs" withEdges />
          </Group>
        )}
      </Stack>

      <Modal
        opened={expiryOpen && !!expiryTarget}
        onClose={() => { closeExpiry(); setExpiryTarget(null) }}
        title="Set Expiry Token"
        size="sm"
      >
        {expiryTarget && (
          <SetExpiryModal token={expiryTarget} onClose={() => { closeExpiry(); setExpiryTarget(null) }} />
        )}
      </Modal>

      <TokenActivityDrawer
        token={activityToken ? { id: activityToken.id, name: activityToken.name, user: activityToken.user } : null}
        opened={activityOpen}
        onClose={() => { closeActivity(); setActivityToken(null) }}
      />
    </Container>
  )
}
