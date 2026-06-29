import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Modal,
  Pagination,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbAlertTriangle,
  TbBan,
  TbClock,
  TbKey,
  TbLayoutGrid,
  TbLayoutList,
  TbRefresh,
  TbSearch,
  TbShieldOff,
  TbTrash,
  TbUsers,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { TokenActivityDrawer } from './TokenActivityDrawer'

interface AdminToken {
  id: string
  name: string
  scopes: string[]
  canWrite: boolean
  isDisabled: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  useCount: number
  lastIp: string | null
  disabledBy: string | null
  disabledAt: string | null
  disabledReason: string | null
  user: { id: string; name: string; email: string; role: string }
}
interface Summary {
  total: number
  active: number
  disabled: number
  expired: number
}

const STALE_DAYS = 30
const EXPIRING_DAYS = 7

function tokenWarnings(t: AdminToken) {
  const now = Date.now()
  const stale =
    !t.isDisabled &&
    !t.expiresAt &&
    (t.lastUsedAt
      ? now - new Date(t.lastUsedAt).getTime() > STALE_DAYS * 86400_000
      : now - new Date(t.createdAt).getTime() > STALE_DAYS * 86400_000)
  const expiring =
    !t.isDisabled &&
    !!t.expiresAt &&
    new Date(t.expiresAt).getTime() - now > 0 &&
    new Date(t.expiresAt).getTime() - now < EXPIRING_DAYS * 86400_000
  const expired = !!t.expiresAt && new Date(t.expiresAt) < new Date() && !t.isDisabled
  const wide = t.canWrite && t.scopes.length === 0
  return { stale, expiring, expired, wide }
}

function tokenStatusColor(t: AdminToken) {
  if (t.isDisabled) return 'gray'
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return 'red'
  return 'green'
}
function tokenStatusLabel(t: AdminToken) {
  if (t.isDisabled) return 'Disabled'
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return 'Expired'
  return 'Active'
}

function TokenActions({
  t,
  onExpiry,
  toggleDisable,
  revoke,
  revokeLoading,
  toggleLoading,
}: {
  t: AdminToken
  onExpiry: () => void
  toggleDisable: (id: string, isDisabled: boolean) => void
  revoke: (t: AdminToken) => void
  revokeLoading: boolean
  toggleLoading: boolean
}) {
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={t.isDisabled ? 'Enable' : 'Disable'} withArrow>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={t.isDisabled ? 'green' : 'orange'}
          loading={toggleLoading}
          onClick={() => toggleDisable(t.id, t.isDisabled)}
        >
          <TbBan size={13} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Set expiry" withArrow>
        <ActionIcon size="sm" variant="subtle" color="blue" onClick={onExpiry}>
          <TbClock size={13} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Revoke (hapus permanen)" withArrow>
        <ActionIcon size="sm" variant="subtle" color="red" loading={revokeLoading} onClick={() => revoke(t)}>
          <TbTrash size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

function TokenCard({
  t,
  onExpiry,
  toggleDisable,
  revoke,
  revokeLoading,
  toggleLoading,
}: {
  t: AdminToken
  onExpiry: () => void
  toggleDisable: (id: string, isDisabled: boolean) => void
  revoke: (t: AdminToken) => void
  revokeLoading: boolean
  toggleLoading: boolean
}) {
  const w = tokenWarnings(t)
  const rowBg = w.expired
    ? 'var(--mantine-color-red-light)'
    : w.expiring
      ? 'var(--mantine-color-orange-light)'
      : undefined
  return (
    <Card withBorder padding="sm" style={{ background: rowBg }}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="xs" fw={600} truncate>
              {t.user.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {t.user.email}
            </Text>
          </Stack>
          <Badge size="xs" color={tokenStatusColor(t)} variant="light">
            {tokenStatusLabel(t)}
          </Badge>
        </Group>
        <Group gap={4} wrap="wrap">
          <Text size="xs" ff="monospace" fw={500}>
            {t.name}
          </Text>
          {t.canWrite && (
            <Badge size="xs" color="orange" variant="light">
              R/W
            </Badge>
          )}
          {w.wide && (
            <Tooltip label="canWrite + scope kosong = akses penuh" withArrow>
              <TbShieldOff size={12} color="var(--mantine-color-red-6)" />
            </Tooltip>
          )}
          {w.stale && (
            <Tooltip label={`Tidak dipakai > ${STALE_DAYS} hari`} withArrow>
              <TbAlertTriangle size={12} color="var(--mantine-color-yellow-6)" />
            </Tooltip>
          )}
          {w.expiring && (
            <Badge size="xs" color="orange" variant="filled">
              Expiring
            </Badge>
          )}
          {w.expired && (
            <Badge size="xs" color="red" variant="filled">
              Expired
            </Badge>
          )}
        </Group>
        {t.disabledReason && (
          <Text size="xs" c="dimmed" fs="italic">
            {t.disabledReason}
          </Text>
        )}
        <Group gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Used: {t.useCount.toLocaleString()}
          </Text>
          {t.lastUsedAt && (
            <Text size="xs" c="dimmed">
              · {new Date(t.lastUsedAt).toLocaleDateString('id-ID')}
            </Text>
          )}
          {t.expiresAt && (
            <Text size="xs" c={w.expired ? 'red' : w.expiring ? 'orange' : 'dimmed'}>
              · Exp: {new Date(t.expiresAt).toLocaleDateString('id-ID')}
            </Text>
          )}
        </Group>
        <Divider />
        <TokenActions
          t={t}
          onExpiry={onExpiry}
          toggleDisable={toggleDisable}
          revoke={revoke}
          revokeLoading={revokeLoading}
          toggleLoading={toggleLoading}
        />
      </Stack>
    </Card>
  )
}

function SetExpiryModal({ token, onClose }: { token: AdminToken; onClose: () => void }) {
  const [val, setVal] = useState(token.expiresAt ? token.expiresAt.slice(0, 10) : '')
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/tokens/${token.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-expiry', expiresAt: val || null }),
      }),
    onSuccess: () => {
      notifyOk('Expiry diperbarui')
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] })
      onClose()
    },
    onError: (e) => notifyErr(e),
  })
  return (
    <Stack gap="sm">
      <Text size="sm">
        Token: <strong>{token.name}</strong> ({token.user.email})
      </Text>
      <TextInput
        type="date"
        label="Expiry baru (kosongkan = tidak ada)"
        value={val}
        onChange={(e) => setVal(e.currentTarget.value)}
        min={new Date().toISOString().slice(0, 10)}
      />
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose}>
          Batal
        </Button>
        <Button loading={mut.isPending} onClick={() => mut.mutate()}>
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}

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

  // Grouping by user
  const groups: { userId: string; name: string; email: string; tokens: AdminToken[] }[] = groupByUser
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
        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Group gap="xs">
            <TbKey size={22} />
            <Title order={3}>Token Control</Title>
          </Group>
          {s && (
            <Group gap="xs" wrap="wrap">
              <Badge color="gray" variant="light">
                {s.total} Total
              </Badge>
              <Badge color="green" variant="light">
                {s.active} Active
              </Badge>
              <Badge color="orange" variant="light">
                {s.disabled} Disabled
              </Badge>
              <Badge color="red" variant="light">
                {s.expired} Expired
              </Badge>
              <ActionIcon variant="subtle" color="gray" onClick={() => refetch()}>
                <TbRefresh size={16} />
              </ActionIcon>
            </Group>
          )}
        </Group>

        {/* Toolbar */}
        <Stack gap="xs">
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="Cari nama token atau user..."
              leftSection={<TbSearch size={13} />}
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value)
                setPage(1)
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Kelompokkan by user" withArrow>
                <ActionIcon
                  size="sm"
                  variant={groupByUser ? 'light' : 'subtle'}
                  color={groupByUser ? 'blue' : 'gray'}
                  onClick={() =>
                    setGroupByUser((v) => {
                      const n = !v
                      localStorage.setItem('admin:tokens:groupByUser', String(n))
                      return n
                    })
                  }
                >
                  <TbUsers size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Table view" withArrow>
                <ActionIcon
                  size="sm"
                  variant={viewMode === 'table' ? 'light' : 'subtle'}
                  color={viewMode === 'table' ? 'blue' : 'gray'}
                  onClick={() => {
                    setViewMode('table')
                    localStorage.setItem('admin:tokens:viewMode', 'table')
                  }}
                >
                  <TbLayoutList size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Card view" withArrow>
                <ActionIcon
                  size="sm"
                  variant={viewMode === 'card' ? 'light' : 'subtle'}
                  color={viewMode === 'card' ? 'blue' : 'gray'}
                  onClick={() => {
                    setViewMode('card')
                    localStorage.setItem('admin:tokens:viewMode', 'card')
                  }}
                >
                  <TbLayoutGrid size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <SegmentedControl
            size="xs"
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
              localStorage.setItem('admin:tokens:status', v)
            }}
            data={[
              { value: 'all', label: 'Semua' },
              { value: 'active', label: 'Active' },
              { value: 'disabled', label: 'Disabled' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
        </Stack>

        {isLoading ? (
          <Text c="dimmed" size="sm">
            Loading...
          </Text>
        ) : isMobile || viewMode === 'card' ? (
          // ── Mobile: Card layout ──
          <Stack gap="sm">
            {groups.map((g) => (
              <Box key={g.userId || 'all'}>
                {groupByUser && g.name && (
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4} style={{ letterSpacing: '0.05em' }}>
                    {g.name}{' '}
                    <Text span c="dimmed" fw={400}>
                      ({g.email})
                    </Text>{' '}
                    <Badge size="xs" variant="light" color="gray">
                      {g.tokens.length}
                    </Badge>
                  </Text>
                )}
                <Stack gap="xs">
                  {g.tokens.map((t) => (
                    <Box
                      key={t.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setActivityToken(t)
                        openActivity()
                      }}
                    >
                      <TokenCard t={t} onExpiry={() => doExpiry(t)} {...commonActionProps} />
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
            {paged.length === 0 && (
              <Text c="dimmed" size="xs" ta="center" py="md">
                Tidak ada token ditemukan.
              </Text>
            )}
          </Stack>
        ) : (
          // ── Desktop: Table layout ──
          <Stack gap={0}>
            {groups.map((g) => (
              <Box key={g.userId || 'all'} mb={groupByUser ? 'sm' : 0}>
                {groupByUser && g.name && (
                  <Group gap="xs" mb={4} mt="xs">
                    <TbUsers size={14} />
                    <Text size="xs" fw={600}>
                      {g.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {g.email}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {g.tokens.length}
                    </Badge>
                  </Group>
                )}
                <Box style={{ overflowX: 'auto' }}>
                  <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                    {!groupByUser || g === groups[0] ? (
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Owner</Table.Th>
                          <Table.Th>Token</Table.Th>
                          <Table.Th visibleFrom="sm">Scope</Table.Th>
                          <Table.Th w={60} visibleFrom="sm">
                            R/W
                          </Table.Th>
                          <Table.Th w={70}>Used</Table.Th>
                          <Table.Th w={110} visibleFrom="md">
                            Last IP
                          </Table.Th>
                          <Table.Th w={100} visibleFrom="sm">
                            Last Used
                          </Table.Th>
                          <Table.Th w={100}>Expires</Table.Th>
                          <Table.Th w={100}>Status</Table.Th>
                          <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                    ) : null}
                    <Table.Tbody>
                      {g.tokens.map((t) => {
                        const w = tokenWarnings(t)
                        const rowBg = w.expired
                          ? 'var(--mantine-color-red-light)'
                          : w.expiring
                            ? 'var(--mantine-color-orange-light)'
                            : undefined
                        return (
                          <Table.Tr
                            key={t.id}
                            bg={rowBg}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setActivityToken(t)
                              openActivity()
                            }}
                          >
                            <Table.Td>
                              <Stack gap={0}>
                                <Text size="xs" fw={500}>
                                  {t.user.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {t.user.email}
                                </Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Group gap={4} wrap="nowrap">
                                <Text size="xs" ff="monospace">
                                  {t.name}
                                </Text>
                                {w.wide && (
                                  <Tooltip label="canWrite + scope kosong = akses penuh" withArrow>
                                    <TbShieldOff size={12} color="var(--mantine-color-red-6)" />
                                  </Tooltip>
                                )}
                                {w.stale && (
                                  <Tooltip label={`Tidak dipakai > ${STALE_DAYS} hari`} withArrow>
                                    <TbAlertTriangle size={12} color="var(--mantine-color-yellow-6)" />
                                  </Tooltip>
                                )}
                                {w.expiring && (
                                  <Badge size="xs" color="orange" variant="filled">
                                    Expiring
                                  </Badge>
                                )}
                                {w.expired && (
                                  <Badge size="xs" color="red" variant="filled">
                                    Expired
                                  </Badge>
                                )}
                              </Group>
                              {t.disabledReason && (
                                <Text size="xs" c="dimmed" fs="italic">
                                  {t.disabledReason}
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td visibleFrom="sm">
                              {t.scopes.length === 0 ? (
                                <Badge size="xs" color="blue" variant="light">
                                  Semua project
                                </Badge>
                              ) : (
                                <Text size="xs" c="dimmed" lineClamp={2}>
                                  {t.scopes.join(', ')}
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td ta="center" visibleFrom="sm">
                              {t.canWrite && (
                                <Badge size="xs" color="orange" variant="light">
                                  R/W
                                </Badge>
                              )}
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="xs">{t.useCount.toLocaleString()}</Text>
                            </Table.Td>
                            <Table.Td visibleFrom="md">
                              <Text size="xs" ff="monospace" c="dimmed">
                                {t.lastIp ?? '—'}
                              </Text>
                            </Table.Td>
                            <Table.Td visibleFrom="sm">
                              <Text size="xs" c="dimmed">
                                {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString('id-ID') : '—'}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text
                                size="xs"
                                c={w.expired ? 'red' : w.expiring ? 'orange' : 'dimmed'}
                                fw={w.expired || w.expiring ? 600 : 400}
                              >
                                {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString('id-ID') : '—'}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge size="xs" color={tokenStatusColor(t)} variant="light">
                                {tokenStatusLabel(t)}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <TokenActions t={t} onExpiry={() => doExpiry(t)} {...commonActionProps} />
                            </Table.Td>
                          </Table.Tr>
                        )
                      })}
                      {g.tokens.length === 0 && (
                        <Table.Tr>
                          <Table.Td colSpan={10}>
                            <Text c="dimmed" size="xs" ta="center" py="md">
                              Tidak ada token ditemukan.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </Box>
              </Box>
            ))}
          </Stack>
        )}

        {/* Pagination footer */}
        {filtered.length > 0 && (
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Group gap="xs" align="center">
              <Text size="xs" c="dimmed">
                {filtered.length} token · hal {page}/{totalPages}
              </Text>
              <Select
                size="xs"
                w={80}
                value={String(pageSize)}
                onChange={(v) => {
                  setPageSize(Number(v))
                  setPage(1)
                }}
                data={['10', '25', '50', '100']}
                allowDeselect={false}
              />
              <Text size="xs" c="dimmed">
                / hal
              </Text>
            </Group>
            <Pagination value={page} onChange={setPage} total={totalPages} size="xs" withEdges />
          </Group>
        )}
      </Stack>

      <Modal
        opened={expiryOpen && !!expiryTarget}
        onClose={() => {
          closeExpiry()
          setExpiryTarget(null)
        }}
        title="Set Expiry Token"
        size="sm"
      >
        {expiryTarget && (
          <SetExpiryModal
            token={expiryTarget}
            onClose={() => {
              closeExpiry()
              setExpiryTarget(null)
            }}
          />
        )}
      </Modal>

      <TokenActivityDrawer
        token={activityToken ? { id: activityToken.id, name: activityToken.name, user: activityToken.user } : null}
        opened={activityOpen}
        onClose={() => {
          closeActivity()
          setActivityToken(null)
        }}
      />
    </Container>
  )
}
