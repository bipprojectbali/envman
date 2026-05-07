import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Collapse,
  CopyButton,
  Divider,
  Group,
  Modal,
  MultiSelect,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import {
  TbAlertTriangle,
  TbCheck,
  TbChevronDown,
  TbClock,
  TbCopy,
  TbKey,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbPlus,
  TbShieldCheck,
  TbTerminal,
  TbToggleLeft,
  TbToggleRight,
  TbTrash,
  TbX,
} from 'react-icons/tb'

export const Route = createFileRoute('/envmanager/tokens')({
  component: TokensPage,
})

const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
    const body = await r.json()
    if (!r.ok) throw new Error(body.error ?? 'Request failed')
    return body
  })

interface ApiToken {
  id: string
  name: string
  scopes: string[]
  canWrite: boolean
  isDisabled: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface ProjectOption {
  slug: string
  name: string
  environments: { name: string }[]
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(dateStr).toLocaleDateString()
}

function expiryStatus(expiresAt: string | null): 'none' | 'active' | 'soon' | 'expired' {
  if (!expiresAt) return 'none'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff < 0) return 'expired'
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'soon'
  return 'active'
}

function buildScopeOptions(projects: ProjectOption[]) {
  return projects.map(p => ({
    group: p.name,
    items: [
      { value: `${p.slug}:*`, label: `${p.slug}:* — semua env` },
      ...p.environments.map(e => ({ value: `${p.slug}:${e.name}`, label: `${p.slug}:${e.name}` })),
    ],
  }))
}

const emptyForm = { name: '', canWrite: false, expiresAt: '', scopes: [] as string[] }

function TokensPage() {
  const qc = useQueryClient()
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editForm, setEditForm] = useState(emptyForm)
  const [expandedUsage, setExpandedUsage] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['envman', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    refetchInterval: 30000,
  })

  const { data: projectsData } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
  })
  const projects: ProjectOption[] = (projectsData?.projects ?? []).map((p: any) => ({
    slug: p.slug,
    name: p.name,
    environments: p.environments ?? [],
  }))
  const scopeOptions = buildScopeOptions(projects)

  const tokens: ApiToken[] = data?.tokens ?? []
  const activeTokens = tokens.filter(t => expiryStatus(t.expiresAt) !== 'expired')
  const expiredTokens = tokens.filter(t => expiryStatus(t.expiresAt) === 'expired')

  const createToken = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch('/api/envman/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || undefined, scopes: body.scopes }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(data.token)
      closeCreate()
      setForm(emptyForm)
      notifyOk('Token berhasil dibuat — salin nilainya sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const editToken = useMutation({
    mutationFn: (body: typeof editForm) =>
      apiFetch(`/api/envman/tokens/${editingToken!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || null, scopes: body.scopes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      closeEdit()
      setEditingToken(null)
      notifyOk('Token diperbarui')
    },
    onError: (e) => notifyErr(e),
  })

  const openEditModal = (t: ApiToken) => {
    setEditingToken(t)
    setEditForm({
      name: t.name,
      canWrite: t.canWrite,
      expiresAt: t.expiresAt ? new Date(t.expiresAt).toISOString().split('T')[0] : '',
      scopes: t.scopes,
    })
    openEdit()
  }

  const toggleToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: (data: { isDisabled: boolean }) => { qc.invalidateQueries({ queryKey: ['envman', 'tokens'] }); notifyOk(data.isDisabled ? 'Token dinonaktifkan' : 'Token diaktifkan') },
    onError: (e) => notifyErr(e),
  })

  const revokeToken = (id: string, name: string) =>
    modals.openConfirmModal({
      title: 'Revoke token',
      children: <Text size="sm">Revoke token <strong>{name}</strong>? Token ini tidak akan bisa digunakan lagi.</Text>,
      labels: { confirm: 'Revoke', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/tokens/${id}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: ['envman', 'tokens'] }); notifyOk(`Token "${name}" direvoke`) })
          .catch(notifyErr),
    })

  const tokenForm = (f: typeof form, setF: typeof setForm) => (
    <Stack gap="md">
      <TextInput
        label="Nama token"
        placeholder="laptop-dev, ci-github, server-prod"
        description="Untuk memudahkan identifikasi sumber penggunaan"
        value={f.name}
        autoFocus
        onChange={e => setF(x => ({ ...x, name: e.target.value }))}
      />

      <Checkbox
        size="xs"
        label={
          <Box>
            <Text size="xs" fw={500}>Read-Write <Text span size="xs" c="dimmed">(advanced)</Text></Text>
            <Text size="xs" c="dimmed">Aktifkan hanya jika token ini perlu push vars ke server via automation/script.</Text>
          </Box>
        }
        checked={f.canWrite}
        onChange={e => setF(x => ({ ...x, canWrite: e.target.checked }))}
      />

      <MultiSelect
        label="Scopes"
        description="Kosong = akses ke semua project yang kamu miliki"
        placeholder={f.scopes.length === 0 ? 'Semua project (tidak dibatasi)' : undefined}
        data={scopeOptions}
        value={f.scopes}
        onChange={v => setF(x => ({ ...x, scopes: v }))}
        searchable
        clearable
        nothingFoundMessage="Tidak ada project/env"
        maxDropdownHeight={220}
      />

      <TextInput
        type="date"
        label="Kedaluwarsa"
        description="Opsional — kosongkan untuk tidak ada batas waktu"
        min={new Date().toISOString().split('T')[0]}
        value={f.expiresAt}
        onChange={e => setF(x => ({ ...x, expiresAt: e.target.value }))}
      />
    </Stack>
  )

  return (
    <Box>
      {/* ─── Header ─────────────────────────── */}
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon size={28} radius="md" variant="light" color="violet">
            <TbKey size={15} />
          </ThemeIcon>
          <Box>
            <Text fw={700} size="sm">API Tokens</Text>
            <Text size="xs" c="dimmed">
              {isLoading ? '...' : `${activeTokens.length} aktif${expiredTokens.length > 0 ? ` · ${expiredTokens.length} expired` : ''}`}
            </Text>
          </Box>
        </Group>
        <Button size="xs" leftSection={<TbPlus size={13} />} color="violet" onClick={openCreate}>
          Buat Token
        </Button>
      </Group>

      <Alert color="gray" p="xs" mb="md" icon={<TbShieldCheck size={14} />}>
        <Text size="xs" c="dimmed">
          Token digunakan CLI untuk autentikasi tanpa password.
          Token <strong>read-only</strong> hanya bisa pull vars · Token <strong>read-write</strong> bisa push vars ke environment.
          Scope kosong = akses ke semua project yang kamu miliki.
        </Text>
      </Alert>

      {/* ─── New token banner ───────────────── */}
      {newToken && (
        <Card withBorder mb="md" p="md" style={{ borderColor: 'var(--mantine-color-teal-5)', position: 'relative' }}>
          <ActionIcon size="xs" variant="subtle" color="gray" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => setNewToken(null)}>
            <TbX size={12} />
          </ActionIcon>
          <Group gap="xs" mb="xs">
            <ThemeIcon size="sm" radius="xl" color="teal" variant="light"><TbCheck size={12} /></ThemeIcon>
            <Text size="xs" fw={600} c="teal">Token berhasil dibuat — simpan sekarang!</Text>
          </Group>
          <Alert color="orange" p="xs" mb="xs" icon={<TbAlertTriangle size={12} />}>
            <Text size="xs">Nilai token hanya ditampilkan <strong>sekali ini saja</strong> dan tidak bisa dilihat lagi.</Text>
          </Alert>
          <Group gap="xs" mb="xs">
            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{newToken}</Code>
            <CopyButton value={newToken}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied!' : 'Copy token'}>
                  <ActionIcon size="sm" variant="filled" color={copied ? 'teal' : 'blue'} onClick={copy}>
                    {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Divider mb="xs" />
          <Text size="xs" c="dimmed" mb={6}>Cara penggunaan:</Text>
          <Stack gap={6}>
            {[
              { label: 'Login & simpan config', cmd: `envman login ${window.location.origin} --token ${newToken}` },
              { label: 'Inject vars ke command', cmd: `envman -e myapp:production -- bun start` },
              { label: 'CI/CD (tanpa login)', cmd: `ENVMAN_SERVER=${window.location.origin} ENVMAN_TOKEN=${newToken} envman -e myapp:production -- bun start` },
            ].map(({ label, cmd }) => (
              <Box key={label}>
                <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                <Group gap="xs">
                  <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
                  <CopyButton value={cmd}>
                    {({ copied, copy }) => (
                      <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                      </ActionIcon>
                    )}
                  </CopyButton>
                </Group>
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      {/* ─── Token list ─────────────────────── */}
      {tokens.length === 0 && !isLoading ? (
        <Card withBorder p="xl" ta="center" style={{ borderStyle: 'dashed' }}>
          <ThemeIcon size={40} radius="xl" variant="light" color="gray" mx="auto" mb="sm"><TbKey size={20} /></ThemeIcon>
          <Text fw={500} mb={4}>Belum ada API token</Text>
          <Text size="sm" c="dimmed" mb="md">Buat token untuk login CLI tanpa password.</Text>
          <Button size="xs" leftSection={<TbPlus size={13} />} onClick={openCreate}>Buat Token Pertama</Button>
        </Card>
      ) : (
        <Stack gap="xs">
          {tokens.map((t) => {
            const expiry = expiryStatus(t.expiresAt)
            const isExpired = expiry === 'expired'
            return (
              <Card key={t.id} withBorder p="sm" style={{
                opacity: t.isDisabled ? 0.5 : isExpired ? 0.6 : 1,
                borderColor: t.isDisabled ? 'var(--mantine-color-gray-5)' : isExpired ? 'var(--mantine-color-red-3)' : undefined,
              }}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                    <ThemeIcon size={30} radius="md" variant="light" color={t.canWrite ? 'orange' : 'blue'}>
                      {t.canWrite ? <TbLockOpen size={14} /> : <TbLock size={14} />}
                    </ThemeIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={2}>
                        <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</Text>
                        <Badge size="xs" color={t.canWrite ? 'orange' : 'blue'} variant="light">{t.canWrite ? 'read-write' : 'read-only'}</Badge>
                        {t.isDisabled && <Badge size="xs" color="gray" variant="filled">disabled</Badge>}
                        {expiry === 'expired' && <Badge size="xs" color="red" variant="filled">expired</Badge>}
                        {expiry === 'soon' && <Badge size="xs" color="yellow" variant="light" leftSection={<TbClock size={9} />}>expires soon</Badge>}
                      </Group>
                      <Group gap="xs" wrap="wrap">
                        {t.scopes.length === 0 ? (
                          <Text size="xs" c="dimmed">semua project</Text>
                        ) : (
                          t.scopes.map(s => (
                            <Badge key={s} size="xs" variant="dot" color="violet" style={{ fontFamily: 'monospace' }}>{s}</Badge>
                          ))
                        )}
                        <Text size="xs" c="dimmed">·</Text>
                        <Text size="xs" c="dimmed">digunakan: {t.lastUsedAt ? relativeTime(t.lastUsedAt) : 'belum pernah'}</Text>
                        <Text size="xs" c="dimmed">dibuat: {relativeTime(t.createdAt)}</Text>
                        {t.expiresAt && !isExpired && (
                          <Text size="xs" c={expiry === 'soon' ? 'yellow' : 'dimmed'}>expires: {new Date(t.expiresAt).toLocaleDateString()}</Text>
                        )}
                        {isExpired && t.expiresAt && (
                          <Text size="xs" c="red">expired: {new Date(t.expiresAt).toLocaleDateString()}</Text>
                        )}
                      </Group>
                    </Box>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label={t.isDisabled ? 'Aktifkan token' : 'Nonaktifkan token'}>
                      <ActionIcon
                        size="sm" variant="subtle"
                        color={t.isDisabled ? 'gray' : 'teal'}
                        loading={toggleToken.isPending}
                        onClick={() => toggleToken.mutate(t.id)}
                      >
                        {t.isDisabled ? <TbToggleLeft size={15} /> : <TbToggleRight size={15} />}
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Lihat cara penggunaan">
                      <ActionIcon
                        size="sm" variant="subtle" color="gray"
                        onClick={() => setExpandedUsage(prev => {
                          const s = new Set(prev)
                          s.has(t.id) ? s.delete(t.id) : s.add(t.id)
                          return s
                        })}
                      >
                        <TbTerminal size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit token">
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEditModal(t)}>
                        <TbPencil size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Revoke token">
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => revokeToken(t.id, t.name)}>
                        <TbTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                <Collapse in={expandedUsage.has(t.id)}>
                  <Divider my="xs" />
                  <Stack gap={6}>
                    {(() => {
                      const origin = window.location.origin
                      const scope = t.scopes.length > 0 ? t.scopes[0] : 'myapp:production'
                      const [scopeProject, scopeEnv] = scope.includes(':') ? scope.split(':') : [scope, 'production']
                      return [
                        { label: 'Login & simpan config', cmd: `envman login ${origin} --token <TOKEN>` },
                        { label: `Inject vars (${scopeProject}:${scopeEnv})`, cmd: `envman -e ${scopeProject}:${scopeEnv} -- bun start` },
                        { label: 'CI/CD tanpa login', cmd: `ENVMAN_SERVER=${origin} ENVMAN_TOKEN=<TOKEN> envman -e ${scopeProject}:${scopeEnv} -- bun start` },
                      ].map(({ label, cmd }) => (
                        <Box key={label}>
                          <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                          <Group gap={4} align="center">
                            <Code fz="xs" style={{ flex: 1, wordBreak: 'break-all', userSelect: 'all' }}>{cmd}</Code>
                            <CopyButton value={cmd}>
                              {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                                  <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                                    {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </CopyButton>
                          </Group>
                        </Box>
                      ))
                    })()}
                    {t.scopes.length === 0 && (
                      <Text size="xs" c="dimmed">Token ini punya akses ke semua project. Ganti <Code fz="xs">myapp:production</Code> dengan project:env yang sesuai.</Text>
                    )}
                  </Stack>
                </Collapse>
              </Card>
            )
          })}
        </Stack>
      )}

      {/* ─── Create modal ───────────────────── */}
      <Modal
        opened={createOpen}
        onClose={() => { closeCreate(); setForm(emptyForm) }}
        title={<Group gap="xs"><ThemeIcon size="sm" variant="light" color="violet" radius="md"><TbKey size={13} /></ThemeIcon><Text fw={600} size="sm">Buat API Token</Text></Group>}
      >
        <Stack gap="md">
          {tokenForm(form, setForm)}
          <Divider />
          <Button fullWidth leftSection={<TbKey size={14} />} onClick={() => createToken.mutate(form)} loading={createToken.isPending} disabled={!form.name}>
            Buat Token
          </Button>
          {createToken.isError && <Text size="xs" c="red">{(createToken.error as Error).message}</Text>}
        </Stack>
      </Modal>

      {/* ─── Edit modal ─────────────────────── */}
      <Modal
        opened={editOpen}
        onClose={() => { closeEdit(); setEditingToken(null) }}
        title={<Group gap="xs"><ThemeIcon size="sm" variant="light" color="violet" radius="md"><TbPencil size={13} /></ThemeIcon><Text fw={600} size="sm">Edit Token</Text></Group>}
      >
        <Stack gap="md">
          {tokenForm(editForm, setEditForm)}
          <Divider />
          <Button fullWidth leftSection={<TbCheck size={14} />} onClick={() => editToken.mutate(editForm)} loading={editToken.isPending} disabled={!editForm.name}>
            Simpan Perubahan
          </Button>
          {editToken.isError && <Text size="xs" c="red">{(editToken.error as Error).message}</Text>}
        </Stack>
      </Modal>
    </Box>
  )
}
