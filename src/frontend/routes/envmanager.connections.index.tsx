import { Alert, Box, Code, Group, Tabs, Text, ThemeIcon } from '@mantine/core'
import { useDebouncedValue, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TbAlertTriangle, TbDatabaseExport, TbPlugConnected, TbTrash } from 'react-icons/tb'
import { BackupPanelContent } from '@/frontend/components/dev/PortainerBackupPanel'
import { type Connection, DeleteConnectionConfirm } from '@/frontend/components/connection/ConnectionCard'
import { ConnectionForm } from '@/frontend/components/connection/ConnectionForm'
import { ConnectionListView } from '@/frontend/components/connection/ConnectionListView'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createFileRoute('/envmanager/connections/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) === 'backup' ? ('backup' as const) : ('connections' as const),
    connectionForm: typeof search.connectionForm === 'string' ? search.connectionForm : undefined,
  }),
  component: ConnectionsPage,
})

function ConnectionsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: sessionData } = useSession()
  const canViewConnections = hasCapability(sessionData?.user, 'connection:view')
  const canManageConnections = sessionData?.user?.role === 'SUPER_ADMIN'
  const { tab, connectionForm: connectionFormId } = Route.useSearch()

  const [form, setForm] = useState({ name: '', portainerUrl: '', apiToken: '' })
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:connections:view', defaultValue: 'grid' })
  const [debouncedSearch] = useDebouncedValue(search, 120)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([
    [
      '/',
      () => {
        searchRef.current?.focus()
        searchRef.current?.select()
      },
    ],
  ])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
  })
  const connections: Connection[] = data?.connections ?? []

  const healthQueries = useQueries({
    queries: connections.map((c) => ({
      queryKey: ['portainer', 'connection-health', c.id],
      queryFn: () => apiFetch(`/api/envman/portainer/connections/${c.id}/health`),
      staleTime: 60_000,
      retry: false,
    })),
  })
  const healthMap = Object.fromEntries(
    connections.map((c, i) => [
      c.id,
      healthQueries[i]?.data as { totalStacks: number; activeStacks: number; inactiveStacks: number } | undefined,
    ]),
  )

  const filteredConnections = useMemo(() => {
    if (!debouncedSearch.trim()) return connections
    const q = debouncedSearch.toLowerCase()
    return connections.filter((c) => c.name.toLowerCase().includes(q) || c.portainerUrl.toLowerCase().includes(q))
  }, [connections, debouncedSearch])

  const isFormOpen = !!connectionFormId
  const editTarget =
    connectionFormId && connectionFormId !== 'new' ? (connections.find((c) => c.id === connectionFormId) ?? null) : null

  useEffect(() => {
    if (connectionFormId === 'new') {
      setForm({ name: '', portainerUrl: '', apiToken: '' })
      setTestResult(null)
    } else if (editTarget) {
      setForm({ name: editTarget.name, portainerUrl: editTarget.portainerUrl, apiToken: '' })
      setTestResult(null)
    }
  }, [connectionFormId, editTarget?.id, editTarget?.portainerUrl, editTarget?.name, editTarget])

  const openCreate = () => navigate({ to: '.', search: (prev) => ({ ...prev, connectionForm: 'new' }), replace: true })
  const openEdit = (c: Connection) =>
    navigate({ to: '.', search: (prev) => ({ ...prev, connectionForm: c.id }), replace: true })
  const handleClose = () =>
    navigate({ to: '.', search: (prev) => ({ ...prev, connectionForm: undefined }), replace: true })

  const testConnection = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { portainerUrl: form.portainerUrl }
      if (form.apiToken) body.apiToken = form.apiToken
      else if (editTarget) {
        body.slug = '_test_'
        body.envName = '_test_'
      }
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
          body: JSON.stringify({
            name: form.name,
            portainerUrl: form.portainerUrl,
            ...(form.apiToken ? { apiToken: form.apiToken } : {}),
          }),
        })
      }
      return apiFetch('/api/envman/portainer/connections', {
        method: 'POST',
        body: JSON.stringify(form),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portainer', 'connections'] })
      notifyOk(editTarget ? 'Connection diperbarui' : 'Connection berhasil ditambahkan')
      handleClose()
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
          <Text fw={600} size="sm">
            Hapus connection
          </Text>
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

  if (!canViewConnections && !canManageConnections) {
    return (
      <Box p="md">
        <Alert color="yellow" icon={<TbAlertTriangle size={16} />} variant="light">
          <Text size="sm" fw={600} mb={4}>
            Tidak punya izin melihat Portainer connections
          </Text>
          <Text size="xs">
            Connection adalah infrastruktur global. Minta SUPER_ADMIN untuk grant capability{' '}
            <Code fz="xs">connection:view</Code>.
          </Text>
        </Alert>
      </Box>
    )
  }

  const totalEnvs = connections.reduce((s, c) => s + (c._count?.configs ?? 0), 0)

  if (isFormOpen) {
    return (
      <ConnectionForm
        form={form}
        setForm={setForm}
        editTarget={editTarget}
        testResult={testResult}
        setTestResult={setTestResult}
        testConnection={testConnection}
        saveConnection={saveConnection}
        handleClose={handleClose}
      />
    )
  }

  return (
    <Box>
      <Tabs
        value={tab}
        variant="outline"
        onChange={(v) =>
          navigate({
            to: '/envmanager/connections',
            search: (prev) => ({
              ...prev,
              tab: (v ?? 'connections') as 'connections' | 'backup',
              connectionForm: undefined,
            }),
          })
        }
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="connections" leftSection={<TbPlugConnected size={14} />}>
            Connections
          </Tabs.Tab>
          <Tabs.Tab value="backup" leftSection={<TbDatabaseExport size={14} />}>
            Backup
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="connections">
          <Alert color="gray" p="xs" mb="md" icon={<TbPlugConnected size={14} />}>
            <Text size="xs" c="dimmed">
              Connections adalah konfigurasi Portainer yang dapat dipakai oleh semua project. Set sekali, pakai berulang
              — tidak perlu input URL dan token di setiap environment.
            </Text>
          </Alert>
          <ConnectionListView
            connections={connections}
            filteredConnections={filteredConnections}
            isLoading={isLoading}
            isError={isError}
            error={error}
            refetch={refetch}
            view={view}
            setView={setView}
            search={search}
            setSearch={setSearch}
            searchRef={searchRef}
            debouncedSearch={debouncedSearch}
            healthMap={healthMap}
            canManageConnections={canManageConnections}
            totalEnvs={totalEnvs}
            openCreate={openCreate}
            openEdit={openEdit}
            deleteConnection={deleteConnection}
            navigate={navigate}
          />
        </Tabs.Panel>

        <Tabs.Panel value="backup" pt="xs">
          <BackupPanelContent />
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
