import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import {
  TbAlertTriangle,
  TbCheck,
  TbExternalLink,
  TbLayoutGrid,
  TbLayoutList,
  TbPencil,
  TbPlus,
  TbPlugConnected,
  TbPlugConnectedX,
  TbSearch,
  TbTrash,
  TbX,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/connections')({
  component: ConnectionsPage,
})

const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
    const body = await r.json()
    if (!r.ok) throw new Error(body.error ?? 'Request failed')
    return body
  })

interface Connection {
  id: string
  name: string
  portainerUrl: string
  createdById: string
  createdAt: string
  _count: { configs: number }
}

function ConnectionsPage() {
  const qc = useQueryClient()
  const [modalOpen, { open, close }] = useDisclosure(false)
  const [editTarget, setEditTarget] = useState<Connection | null>(null)
  const [form, setForm] = useState({ name: '', portainerUrl: '', apiToken: '' })
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:connections:view', defaultValue: 'grid' })

  const { data, isLoading } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const connections: Connection[] = data?.connections ?? []

  const filteredConnections = useMemo(() => {
    if (!search.trim()) return connections
    const q = search.toLowerCase()
    return connections.filter(c => c.name.toLowerCase().includes(q) || c.portainerUrl.toLowerCase().includes(q))
  }, [connections, search])

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
      // Test by probing stacks — create a temporary connection first
      const body: Record<string, unknown> = { portainerUrl: form.portainerUrl }
      if (form.apiToken) body.apiToken = form.apiToken
      else if (editTarget) { body.slug = '_test_'; body.envName = '_test_' }
      // Use the legacy probe endpoint for testing
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

  const deleteConnection = (id: string, name: string, usedBy: number) =>
    modals.openConfirmModal({
      title: 'Hapus connection',
      children: (
        <Stack gap="xs">
          <Text size="sm">Hapus <strong>{name}</strong>?</Text>
          {usedBy > 0 && (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">{usedBy} environment masih menggunakan connection ini. Mereka perlu dikonfigurasi ulang.</Text>
            </Alert>
          )}
        </Stack>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/portainer/connections/${id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['portainer', 'connections'] }); notifyOk(`Connection "${name}" dihapus`) })
          .catch(notifyErr),
    })

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon size={28} radius="md" variant="light" color="violet">
            <TbPlugConnected size={15} />
          </ThemeIcon>
          <Box>
            <Text fw={700} size="sm">Portainer Connections</Text>
            <Text size="xs" c="dimmed">
              {isLoading ? '…' : `${connections.length} connection${connections.length !== 1 ? 's' : ''}`}
            </Text>
          </Box>
        </Group>
        <Group gap="xs">
          <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}>
              {view === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
            </ActionIcon>
          </Tooltip>
          <Button size="xs" leftSection={<TbPlus size={13} />} color="violet" onClick={openCreate}>
            Add Connection
          </Button>
        </Group>
      </Group>

      <Alert color="gray" p="xs" mb="md" icon={<TbPlugConnected size={14} />}>
        <Text size="xs" c="dimmed">
          Connections adalah konfigurasi Portainer yang dapat dipakai oleh semua project.
          Set sekali, pakai berulang — tidak perlu input URL dan token di setiap environment.
        </Text>
      </Alert>

      {connections.length > 0 && (
        <TextInput
          size="xs"
          mb="sm"
          placeholder="Cari nama atau URL..."
          leftSection={<TbSearch size={13} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          rightSection={search ? <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}><TbX size={11} /></ActionIcon> : undefined}
        />
      )}

      {!isLoading && connections.length === 0 ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={40} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
            <TbPlugConnectedX size={20} />
          </ThemeIcon>
          <Text fw={500} mb={4}>Belum ada connection</Text>
          <Text size="sm" c="dimmed" mb="md">
            Tambah Portainer instance yang akan digunakan oleh project-project kamu.
          </Text>
          <Button size="xs" leftSection={<TbPlus size={13} />} onClick={openCreate}>
            Add Connection
          </Button>
        </Card>
      ) : filteredConnections.length === 0 ? (
        <Card withBorder p="lg" ta="center" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed">Tidak ada connection yang cocok.</Text>
          <Button size="xs" variant="subtle" mt="xs" onClick={() => setSearch('')}>Reset</Button>
        </Card>
      ) : view === 'grid' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {filteredConnections.map(c => (
            <Card key={c.id} withBorder p="md">
              <Group justify="space-between" mb="xs">
                <ThemeIcon size={36} radius="md" variant="light" color="violet">
                  <TbPlugConnected size={18} />
                </ThemeIcon>
                <Group gap={4}>
                  <Tooltip label="Edit">
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => openEdit(c)}><TbPencil size={12} /></ActionIcon>
                  </Tooltip>
                  <Tooltip label="Hapus">
                    <ActionIcon size="xs" variant="subtle" color="red" onClick={() => deleteConnection(c.id, c.name, c._count.configs)}><TbTrash size={12} /></ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
              <Text fw={700} size="sm" mb={2}>{c.name}</Text>
              <Group gap="xs" mb="xs">
                <Badge size="xs" variant="outline" color="gray">{c._count.configs} env</Badge>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.portainerUrl.replace(/^https?:\/\//, '')}
                </Text>
                <ActionIcon size="xs" variant="subtle" color="gray" component="a" href={c.portainerUrl} target="_blank" rel="noreferrer">
                  <TbExternalLink size={11} />
                </ActionIcon>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Stack gap="xs">
          {filteredConnections.map(c => (
            <Card key={c.id} withBorder p="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm">
                  <ThemeIcon size={32} radius="md" variant="light" color="violet">
                    <TbPlugConnected size={16} />
                  </ThemeIcon>
                  <Box>
                    <Group gap="xs" mb={2}>
                      <Text fw={600} size="sm">{c.name}</Text>
                      <Badge size="xs" variant="outline" color="gray">{c._count.configs} env</Badge>
                    </Group>
                    <Group gap="xs">
                      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                        {c.portainerUrl.replace(/^https?:\/\//, '')}
                      </Text>
                      <Tooltip label="Buka Portainer">
                        <ActionIcon size="xs" variant="subtle" color="gray" component="a" href={c.portainerUrl} target="_blank" rel="noreferrer">
                          <TbExternalLink size={11} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Box>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <Tooltip label="Edit">
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEdit(c)}>
                      <TbPencil size={13} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Hapus">
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => deleteConnection(c.id, c.name, c._count.configs)}>
                      <TbTrash size={13} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal
        opened={modalOpen}
        onClose={handleClose}
        title={
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="violet" radius="md">
              <TbPlugConnected size={13} />
            </ThemeIcon>
            <Text fw={600} size="sm">{editTarget ? 'Edit Connection' : 'Tambah Connection'}</Text>
          </Group>
        }
      >
        <Stack gap="sm">
          <TextInput
            label="Nama"
            placeholder="Production Portainer, Dev Server, ..."
            description="Nama untuk identifikasi — akan muncul di setiap environment setup"
            value={form.name}
            autoFocus
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <TextInput
            label="Portainer URL"
            placeholder="https://portainer.example.com"
            value={form.portainerUrl}
            onChange={e => setForm(f => ({ ...f, portainerUrl: e.target.value }))}
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
            >
              <Text size="xs">{testResult.message}</Text>
            </Alert>
          )}

          <Group gap="xs">
            <Button
              size="xs"
              variant="outline"
              color="gray"
              loading={testConnection.isPending}
              disabled={!form.portainerUrl || (!form.apiToken && !editTarget)}
              onClick={() => testConnection.mutate()}
            >
              Test Connection
            </Button>
          </Group>

          <Divider />

          <Button
            fullWidth
            leftSection={editTarget ? <TbCheck size={14} /> : <TbPlus size={14} />}
            loading={saveConnection.isPending}
            disabled={!form.name || !form.portainerUrl || (!editTarget && !form.apiToken)}
            onClick={() => saveConnection.mutate()}
          >
            {editTarget ? 'Update' : 'Simpan Connection'}
          </Button>
        </Stack>
      </Modal>
    </Box>
  )
}
