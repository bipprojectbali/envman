import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Kbd,
  Modal,
  Paper,
  PasswordInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useLocalStorage, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  TbAlertTriangle,
  TbCheck,
  TbClock,
  TbExternalLink,
  TbLayoutGrid,
  TbLayoutList,
  TbPencil,
  TbPlugConnected,
  TbPlugConnectedX,
  TbPlus,
  TbSearch,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createFileRoute('/envmanager/connections/')({
  component: ConnectionsPage,
})

interface Connection {
  id: string
  name: string
  portainerUrl: string
  createdById: string
  createdAt: string
  _count: { configs: number }
}

function relativeDate(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0 || Number.isNaN(ms)) return ''
  if (ms < 60_000) return 'baru saja'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} bln lalu`
  return `${Math.floor(mo / 12)} thn lalu`
}

const HOVER_STYLES = `
.envman-conn-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-conn-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-conn-card:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
`

function ConnectionsPage() {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canViewConnections = hasCapability(sessionData?.user, 'connection:view')
  const canManageConnections = sessionData?.user?.role === 'SUPER_ADMIN'

  const [modalOpen, { open, close }] = useDisclosure(false)
  const [editTarget, setEditTarget] = useState<Connection | null>(null)
  const [form, setForm] = useState({ name: '', portainerUrl: '', apiToken: '' })
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:connections:view', defaultValue: 'grid' })
  const [debouncedSearch] = useDebouncedValue(search, 120)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([
    ['/', () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }],
  ])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const connections: Connection[] = data?.connections ?? []

  const healthQueries = useQueries({
    queries: connections.map(c => ({
      queryKey: ['portainer', 'connection-health', c.id],
      queryFn: () => apiFetch(`/api/envman/portainer/connections/${c.id}/health`),
      staleTime: 60_000,
      retry: false,
    })),
  })
  const healthMap = Object.fromEntries(
    connections.map((c, i) => [c.id, healthQueries[i]?.data as { totalStacks: number; activeStacks: number; inactiveStacks: number } | undefined]),
  )

  const filteredConnections = useMemo(() => {
    if (!debouncedSearch.trim()) return connections
    const q = debouncedSearch.toLowerCase()
    return connections.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.portainerUrl.toLowerCase().includes(q),
    )
  }, [connections, debouncedSearch])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ name: '', portainerUrl: '', apiToken: '' })
    setTestResult(null)
    open()
  }

  const openEdit = (c: Connection) => {
    setEditTarget(c)
    setForm({ name: c.name, portainerUrl: c.portainerUrl, apiToken: '' })
    setTestResult(null)
    open()
  }

  const handleClose = () => {
    close()
    setEditTarget(null)
    setForm({ name: '', portainerUrl: '', apiToken: '' })
    setTestResult(null)
  }

  const testConnection = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { portainerUrl: form.portainerUrl }
      if (form.apiToken) body.apiToken = form.apiToken
      else if (editTarget) { body.slug = '_test_'; body.envName = '_test_' }
      return apiFetch('/api/envman/portainer/probe', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: (data) => setTestResult({ ok: true, message: `Connected — ${data.stacks.length} stack(s) ditemukan` }),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  })

  const saveConnection = useMutation({
    mutationFn: () => {
      if (editTarget) {
        return apiFetch(`/api/envman/portainer/connections/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, portainerUrl: form.portainerUrl, ...(form.apiToken ? { apiToken: form.apiToken } : {}) }),
        })
      }
      return apiFetch('/api/envman/portainer/connections', {
        method: 'POST',
        body: JSON.stringify(form),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portainer', 'connections'] })
      handleClose()
      notifyOk(editTarget ? 'Connection diperbarui' : 'Connection berhasil ditambahkan')
    },
    onError: (e) => notifyErr(e),
  })

  const deleteConnection = (id: string, name: string, usedBy: number) => {
    const modalId = `delete-conn-${id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus connection</Text>
        </Group>
      ),
      children: (
        <DeleteConnectionConfirm
          name={name}
          usedBy={usedBy}
          onCancel={() => modals.close(modalId)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/portainer/connections/${id}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['portainer', 'connections'] })
              notifyOk(`Connection "${name}" dihapus`)
              modals.close(modalId)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  // Early gate
  if (!canViewConnections && !canManageConnections) {
    return (
      <Box p="md">
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} variant="light">
          <Text size="sm" fw={600} mb={4}>Tidak punya izin melihat Portainer connections</Text>
          <Text size="xs">
            Connection adalah infrastruktur global. Minta SUPER_ADMIN untuk grant capability <Code fz="xs">connection:view</Code>.
          </Text>
        </Alert>
      </Box>
    )
  }

  const totalEnvs = connections.reduce((s, c) => s + (c._count?.configs ?? 0), 0)

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md" wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="primary">
            <TbPlugConnected size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>Portainer Connections</Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {isLoading
                ? 'Memuat...'
                : connections.length === 0
                  ? 'Belum ada connection'
                  : `${connections.length} connection · ${totalEnvs} environment terhubung`}
            </Text>
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {connections.length > 0 && (
            <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
              <ActionIcon
                size="lg" variant="default"
                aria-label="Ganti tampilan"
                onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
              >
                {view === 'grid' ? <TbLayoutList size={16} /> : <TbLayoutGrid size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
          {canManageConnections && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="primary" onClick={openCreate}>
              Add Connection
            </Button>
          )}
        </Group>
      </Group>

      <Alert color="gray" p="xs" mb="md" icon={<TbPlugConnected size={14} />}>
        <Text size="xs" c="dimmed">
          Connections adalah konfigurasi Portainer yang dapat dipakai oleh semua project.
          Set sekali, pakai berulang — tidak perlu input URL dan token di setiap environment.
        </Text>
      </Alert>

      {/* ─── Toolbar ────────────────────────── */}
      {!isError && connections.length > 0 && (
        <Paper withBorder radius="md" p="xs" mb="md">
          <TextInput
            ref={searchRef}
            size="sm"
            placeholder="Cari nama atau URL..."
            leftSection={<TbSearch size={14} />}
            rightSection={
              search ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                  <TbX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus">
                  <Kbd size="xs">/</Kbd>
                </Tooltip>
              )
            }
            rightSectionWidth={34}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {debouncedSearch.trim() && filteredConnections.length < connections.length && (
            <Group justify="space-between" mt="xs" gap="xs">
              <Text size="xs" c="dimmed">
                {filteredConnections.length} dari {connections.length} connection
              </Text>
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={() => setSearch('')}>
                Reset pencarian
              </Button>
            </Group>
          )}
        </Paper>
      )}

      {/* ─── Error state ────────────────────── */}
      {isError && (
        <Card withBorder p="xl" ta="center" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat connections</Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar connection.'}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Card>
      )}

      {/* ─── List/grid ─────────────────────── */}
      {!isError && isLoading ? (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {[0, 1, 2].map(i => <Skeleton key={i} height={148} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2].map(i => <Skeleton key={i} height={72} radius="md" />)}
          </Stack>
        )
      ) : !isError && connections.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm">
            <TbPlugConnectedX size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Belum ada connection</Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Tambah Portainer instance yang dapat dipakai semua project untuk auto-sync env vars ke container stack.
          </Text>
          {canManageConnections ? (
            <Button size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={openCreate}>
              Add Connection
            </Button>
          ) : (
            <Text size="xs" c="dimmed">Connection adalah infrastruktur global — hanya SUPER_ADMIN yang boleh menambah.</Text>
          )}
        </Card>
      ) : !isError && filteredConnections.length === 0 ? (
        <Card withBorder p="lg" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbSearch size={22} />
          </ThemeIcon>
          <Text fw={600} mb={4}>Tidak ada hasil</Text>
          <Text size="sm" c="dimmed" mb="md">Tidak ada connection yang cocok dengan "{debouncedSearch}".</Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={() => setSearch('')}>
            Reset pencarian
          </Button>
        </Card>
      ) : !isError && view === 'grid' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {filteredConnections.map(c => (
            <ConnectionGridCard
              key={c.id}
              connection={c}
              health={healthMap[c.id]}
              canManage={canManageConnections}
              onOpen={() => navigate({ to: '/envmanager/connections/$id', params: { id: c.id } })}
              onEdit={() => openEdit(c)}
              onDelete={() => deleteConnection(c.id, c.name, c._count.configs)}
            />
          ))}
        </SimpleGrid>
      ) : !isError ? (
        <Stack gap="xs">
          {filteredConnections.map(c => (
            <ConnectionListCard
              key={c.id}
              connection={c}
              health={healthMap[c.id]}
              canManage={canManageConnections}
              onOpen={() => navigate({ to: '/envmanager/connections/$id', params: { id: c.id } })}
              onEdit={() => openEdit(c)}
              onDelete={() => deleteConnection(c.id, c.name, c._count.configs)}
            />
          ))}
        </Stack>
      ) : null}

      {/* ─── Create/Edit modal ─────────────── */}
      <Modal
        opened={modalOpen}
        onClose={handleClose}
        fullScreen={isMobile}
        size="md"
        centered
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="primary" radius="md">
              <TbPlugConnected size={13} />
            </ThemeIcon>
            <Text fw={600} size="sm">{editTarget ? 'Edit Connection' : 'Tambah Connection'}</Text>
          </Group>
        }
      >
        <Stack gap="md">
          <TextInput
            label="Nama"
            placeholder="Production Portainer, Dev Server, ..."
            description="Nama untuk identifikasi — akan muncul di setiap environment setup"
            value={form.name}
            autoFocus
            data-autofocus
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <TextInput
            label="Portainer URL"
            placeholder="https://portainer.example.com"
            description="URL lengkap dengan protokol (https://) tanpa path"
            value={form.portainerUrl}
            onChange={e => setForm(f => ({ ...f, portainerUrl: e.target.value.trim() }))}
            error={
              form.portainerUrl && !/^https?:\/\//.test(form.portainerUrl)
                ? 'URL harus diawali http:// atau https://'
                : undefined
            }
          />
          <PasswordInput
            label="API Token"
            placeholder={editTarget ? '— kosongkan untuk pakai token lama —' : 'ptr_xxxxxxxxxxxx'}
            description={
              editTarget && !form.apiToken
                ? 'Token tersimpan tetap digunakan jika dikosongkan'
                : 'Buat di Portainer: Account → Access tokens → Add access token'
            }
            value={form.apiToken}
            onChange={e => setForm(f => ({ ...f, apiToken: e.target.value }))}
          />

          {testResult && (
            <Alert
              color={testResult.ok ? 'teal' : 'red'}
              icon={testResult.ok ? <TbCheck size={14} /> : <TbAlertTriangle size={14} />}
              p="xs"
              withCloseButton
              onClose={() => setTestResult(null)}
            >
              <Text size="xs">{testResult.message}</Text>
            </Alert>
          )}

          <Group justify="space-between" gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<TbPlugConnected size={13} />}
              loading={testConnection.isPending}
              disabled={!form.portainerUrl || (!form.apiToken && !editTarget)}
              onClick={() => testConnection.mutate()}
            >
              Test Connection
            </Button>
            <Text size="xs" c="dimmed">
              {form.apiToken || editTarget ? '' : 'Test perlu URL + token'}
            </Text>
          </Group>

          <Divider />

          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={handleClose}>Batal</Button>
            <Button
              leftSection={editTarget ? <TbCheck size={14} /> : <TbPlus size={14} />}
              color="primary"
              loading={saveConnection.isPending}
              disabled={!form.name || !form.portainerUrl || (!editTarget && !form.apiToken)}
              onClick={() => saveConnection.mutate()}
            >
              {editTarget ? 'Update' : 'Simpan Connection'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}

// ─── Card components ─────────────────────────────────────────────────────────

interface CardProps {
  connection: Connection
  health?: { totalStacks: number; activeStacks: number; inactiveStacks: number }
  canManage: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

function HealthBadge({ health }: { health?: { totalStacks: number; activeStacks: number; inactiveStacks: number } }) {
  if (!health) return null
  const color = health.inactiveStacks === 0 ? 'teal' : health.activeStacks === 0 ? 'red' : 'orange'
  return (
    <Tooltip label={`${health.activeStacks} aktif, ${health.inactiveStacks} tidak aktif, dari ${health.totalStacks} total stack`}>
      <Badge size="xs" variant="light" color={color}>
        {health.activeStacks}/{health.totalStacks} active
      </Badge>
    </Tooltip>
  )
}

function ConnectionGridCard({ connection: c, health, canManage, onOpen, onEdit, onDelete }: CardProps) {
  return (
    <Card
      withBorder
      p="md"
      className="envman-conn-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka connection ${c.name}`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <ThemeIcon size={40} radius="md" variant="light" color="primary">
          <TbPlugConnected size={20} />
        </ThemeIcon>
        {canManage && (
          <Group gap={4} onClick={e => e.stopPropagation()}>
            <Tooltip label="Edit">
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Edit connection" onClick={onEdit}>
                <TbPencil size={13} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus">
              <ActionIcon size="sm" variant="subtle" color="red" aria-label="Hapus connection" onClick={onDelete}>
                <TbTrash size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>

      <Text fw={700} size="md" mb={2} lh={1.3} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.name}
      </Text>
      <Group gap={4} mb="xs" align="center">
        <Code fz="xs" c="dimmed" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.portainerUrl.replace(/^https?:\/\//, '')}
        </Code>
        <Tooltip label="Buka Portainer UI">
          <ActionIcon
            size="xs" variant="subtle" color="gray"
            aria-label="Buka Portainer UI"
            component="a"
            href={c.portainerUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
          >
            <TbExternalLink size={11} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group gap="xs" mt="auto" pt="xs" wrap="wrap" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Tooltip label={`${c._count.configs} environment menggunakan connection ini`}>
          <Badge size="xs" variant="default">{c._count.configs} env</Badge>
        </Tooltip>
        <HealthBadge health={health} />
        <Tooltip label={`Dibuat ${new Date(c.createdAt).toLocaleString('id-ID')}`}>
          <Group gap={4} style={{ marginLeft: 'auto' }}>
            <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="xs" c="dimmed">{relativeDate(c.createdAt)}</Text>
          </Group>
        </Tooltip>
      </Group>
    </Card>
  )
}

function ConnectionListCard({ connection: c, health, canManage, onOpen, onEdit, onDelete }: CardProps) {
  return (
    <Card
      withBorder
      p="sm"
      className="envman-conn-card"
      role="link"
      tabIndex={0}
      aria-label={`Buka connection ${c.name}`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ cursor: 'pointer' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={36} radius="md" variant="light" color="primary">
            <TbPlugConnected size={18} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" mb={2} wrap="nowrap">
              <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </Text>
              <Tooltip label={`${c._count.configs} environment menggunakan connection ini`}>
                <Badge size="xs" variant="default">{c._count.configs} env</Badge>
              </Tooltip>
              <HealthBadge health={health} />
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Code fz="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                {c.portainerUrl.replace(/^https?:\/\//, '')}
              </Code>
              <Tooltip label="Buka Portainer UI">
                <ActionIcon
                  size="xs" variant="subtle" color="gray"
                  aria-label="Buka Portainer UI"
                  component="a"
                  href={c.portainerUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                >
                  <TbExternalLink size={11} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={`Dibuat ${new Date(c.createdAt).toLocaleString('id-ID')}`}>
                <Group gap={4}>
                  <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  <Text size="xs" c="dimmed">{relativeDate(c.createdAt)}</Text>
                </Group>
              </Tooltip>
            </Group>
          </Box>
        </Group>
        {canManage && (
          <Group gap="xs" wrap="nowrap" onClick={e => e.stopPropagation()}>
            <Tooltip label="Edit">
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Edit connection" onClick={onEdit}>
                <TbPencil size={13} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Hapus" position="left">
              <ActionIcon size="sm" variant="subtle" color="red" aria-label="Hapus connection" onClick={onDelete}>
                <TbTrash size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Card>
  )
}

// ─── Type-to-confirm delete ──────────────────────────────────────────────────

function DeleteConnectionConfirm({
  name, usedBy, onCancel, onConfirm,
}: {
  name: string
  usedBy: number
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const canDelete = typed === name

  const handleConfirm = async () => {
    if (!canDelete || loading) return
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        Connection <strong>{name}</strong> akan dihapus.
      </Text>
      {usedBy > 0 && (
        <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
          <Text size="xs">
            <strong>{usedBy} environment</strong> masih menggunakan connection ini.
            Setelah dihapus, environment tersebut perlu dikonfigurasi ulang sebelum bisa sync ke Portainer.
          </Text>
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        Ketik <Code fz="xs">{name}</Code> untuk mengkonfirmasi:
      </Text>
      <TextInput
        size="sm"
        placeholder={name}
        value={typed}
        autoFocus
        data-autofocus
        spellCheck={false}
        onChange={e => setTyped(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canDelete) handleConfirm() }}
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button
          color="red"
          leftSection={<TbTrash size={13} />}
          disabled={!canDelete}
          loading={loading}
          onClick={handleConfirm}
        >
          Hapus Permanen
        </Button>
      </Group>
    </Stack>
  )
}
