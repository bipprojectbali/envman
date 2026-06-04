import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCopy, TbCopyCheck, TbKey, TbPlus, TbRefresh, TbToggleLeft, TbToggleRight, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { ProfileTokensToolbar, type ViewMode } from './ProfileTokensToolbar'

interface Token {
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

function tokenStatus(t: Token) {
  if (t.isDisabled) return { label: 'Disabled', color: 'gray' }
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return { label: 'Expired', color: 'red' }
  return { label: 'Active', color: 'green' }
}

function RevealButton({ id }: { id: string }) {
  const cb = useClipboard({ timeout: 2000 })
  const reveal = useMutation({
    mutationFn: () => apiFetch<{ token: string }>(`/api/envman/tokens/${id}/reveal`),
    onSuccess: (d) => cb.copy(d.token),
  })
  return (
    <Tooltip label={cb.copied ? 'Token disalin!' : 'Copy token'} withArrow>
      <ActionIcon
        size="sm"
        variant="subtle"
        color={cb.copied ? 'green' : 'gray'}
        loading={reveal.isPending}
        onClick={() => reveal.mutate()}
      >
        {cb.copied ? <TbCopyCheck size={14} /> : <TbCopy size={14} />}
      </ActionIcon>
    </Tooltip>
  )
}

function TokenActions({
  t,
  toggle,
  rotate,
  remove,
}: {
  t: Token
  toggle: (id: string) => void
  rotate: (id: string) => void
  remove: (id: string) => void
}) {
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

function TokenRow({
  t,
  toggle,
  rotate,
  remove,
}: {
  t: Token
  toggle: (id: string) => void
  rotate: (id: string) => void
  remove: (id: string) => void
}) {
  const st = tokenStatus(t)
  return (
    <Stack gap={4} py={8} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group justify="space-between" wrap="wrap" align="flex-start" gap="xs">
        <Group gap="xs" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} style={{ wordBreak: 'break-all' }}>
            {t.name}
          </Text>
          <Badge size="xs" color={st.color} variant="light">
            {st.label}
          </Badge>
          {t.canWrite && (
            <Badge size="xs" color="orange" variant="light">
              R/W
            </Badge>
          )}
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
          {t.tags.map((tag) => (
            <Badge key={tag} size="xs" variant="dot" color="blue">
              {tag}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  )
}

function TokenCard({
  t,
  toggle,
  rotate,
  remove,
}: {
  t: Token
  toggle: (id: string) => void
  rotate: (id: string) => void
  remove: (id: string) => void
}) {
  const st = tokenStatus(t)
  return (
    <Card padding="sm" withBorder>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600} truncate style={{ flex: 1 }}>
            {t.name}
          </Text>
          <Badge size="xs" color={st.color} variant="light">
            {st.label}
          </Badge>
        </Group>
        {t.canWrite && (
          <Badge size="xs" color="orange" variant="light" w="fit-content">
            Read-Write
          </Badge>
        )}
        <Text size="xs" c="dimmed">
          Dibuat: {new Date(t.createdAt).toLocaleDateString('id-ID')}
          {t.expiresAt ? (
            <>
              <br />
              Exp: {new Date(t.expiresAt).toLocaleDateString('id-ID')}
            </>
          ) : (
            ''
          )}
        </Text>
        {t.tags.length > 0 && (
          <Group gap={4}>
            {t.tags.map((tag) => (
              <Badge key={tag} size="xs" variant="dot" color="blue">
                {tag}
              </Badge>
            ))}
          </Group>
        )}
        <Divider />
        <TokenActions t={t} toggle={toggle} rotate={rotate} remove={remove} />
      </Stack>
    </Card>
  )
}

export function ProfileTokensSection({ role }: { role: string }) {
  const qc = useQueryClient()
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [newName, setNewName] = useState('')
  const [newWrite, setNewWrite] = useState(false)
  const [newExpiry, setNewExpiry] = useState('')
  const [newTags, setNewTags] = useState<string[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)
  const newTokenCb = useClipboard({ timeout: 2000 })

  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [groupByTag, setGroupByTag] = useState(() => localStorage.getItem('profile:tokens:groupByTag') !== 'false')
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('profile:tokens:viewMode') as ViewMode) ?? 'list',
  )
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['envman', 'settings'],
    queryFn: () => apiFetch('/api/envman/settings'),
  })
  const settings = settingsData?.settings ?? {}
  const creationAllowed = settings.user_token_creation !== 'false'
  const maxDays = Number(settings.user_token_max_days ?? '0') || 0
  const maxExpiry = maxDays > 0 ? new Date(Date.now() + maxDays * 86_400_000) : null

  const { data, isLoading } = useQuery<{ tokens: Token[] }>({
    queryKey: ['profile', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    enabled: role !== 'QC',
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['profile', 'tokens'] })
  const resetCreate = () => {
    setNewToken(null)
    setNewName('')
    setNewWrite(false)
    setNewExpiry('')
    setNewTags([])
    closeCreate()
  }

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ token: string }>('/api/envman/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: newName, canWrite: newWrite, expiresAt: newExpiry || null, tags: newTags }),
      }),
    onSuccess: (d) => {
      setNewToken(d.token)
      invalidate()
    },
  })
  const toggle = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: invalidate,
  })
  const rotate = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/rotate`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  if (role === 'QC') return null

  const allTokens = data?.tokens ?? []
  const allTags = [...new Set(allTokens.flatMap((t) => t.tags))].sort()

  const filtered = allTokens.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    if (selectedTags.length > 0 && !t.tags.some((tag) => selectedTags.includes(tag))) return false
    if (dateFrom && new Date(t.createdAt) < new Date(dateFrom)) return false
    if (dateTo && new Date(t.createdAt) > new Date(`${dateTo}T23:59:59`)) return false
    return true
  })

  // Grouping: token muncul di semua grup tagnya
  const groups: { label: string; tokens: Token[] }[] = groupByTag
    ? [
        ...(allTags.length > 0
          ? allTags
              .filter((tag) => selectedTags.length === 0 || selectedTags.includes(tag))
              .map((tag) => ({ label: tag, tokens: filtered.filter((t) => t.tags.includes(tag)) }))
              .filter((g) => g.tokens.length > 0)
          : []),
        { label: 'Lainnya', tokens: filtered.filter((t) => t.tags.length === 0) },
      ].filter((g) => g.tokens.length > 0)
    : [{ label: '', tokens: filtered }]

  return (
    <Box
      p="md"
      style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
    >
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <TbKey size={15} />
          <Text fw={600} size="sm">
            API Tokens
          </Text>
          {allTokens.length > 0 && (
            <Badge size="xs" variant="light" color="gray">
              {allTokens.length}
            </Badge>
          )}
        </Group>
        {creationAllowed && (
          <Button size="xs" leftSection={<TbPlus size={14} />} onClick={openCreate}>
            Buat Token
          </Button>
        )}
      </Group>
      <Divider mb="sm" />

      {isLoading ? (
        <Text c="dimmed" size="xs">
          Loading...
        </Text>
      ) : !allTokens.length ? (
        <Text c="dimmed" size="xs" ta="center" py="sm">
          {creationAllowed
            ? 'Belum ada token. Buat token untuk akses API.'
            : 'Pembuatan token dinonaktifkan oleh administrator.'}
        </Text>
      ) : (
        <Stack gap="sm">
          <ProfileTokensToolbar
            search={search}
            onSearch={setSearch}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={setDateFrom}
            onDateTo={setDateTo}
            allTags={allTags}
            selectedTags={selectedTags}
            onToggleTag={(tag) =>
              setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
            }
            groupByTag={groupByTag}
            onGroupByTag={(v) => {
              setGroupByTag(v)
              localStorage.setItem('profile:tokens:groupByTag', String(v))
            }}
            viewMode={viewMode}
            onViewMode={(v) => {
              setViewMode(v)
              localStorage.setItem('profile:tokens:viewMode', v)
            }}
          />

          {groups.map((g) => (
            <Box key={g.label}>
              {groupByTag && g.label && (
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={6} style={{ letterSpacing: '0.05em' }}>
                  {g.label}{' '}
                  <Badge size="xs" variant="light" color="gray" ml={4}>
                    {g.tokens.length}
                  </Badge>
                </Text>
              )}
              {viewMode === 'grid' ? (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} mb={groupByTag ? 'sm' : 0}>
                  {g.tokens.map((t) => (
                    <TokenCard key={t.id} t={t} toggle={toggle.mutate} rotate={rotate.mutate} remove={remove.mutate} />
                  ))}
                </SimpleGrid>
              ) : (
                g.tokens.map((t) => (
                  <TokenRow key={t.id} t={t} toggle={toggle.mutate} rotate={rotate.mutate} remove={remove.mutate} />
                ))
              )}
            </Box>
          ))}

          {filtered.length === 0 && (
            <Text c="dimmed" size="xs" ta="center" py="sm">
              Tidak ada token yang cocok dengan filter.
            </Text>
          )}
        </Stack>
      )}

      <Modal opened={createOpen && !newToken} onClose={closeCreate} title="Buat Token Baru" size="sm">
        <Stack gap="sm">
          <TextInput
            label="Nama"
            placeholder="misal: laptop-dev"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            required
          />
          <Switch
            label="Read-Write"
            description="Izinkan token untuk menulis/mengubah vars"
            checked={newWrite}
            onChange={(e) => setNewWrite(e.currentTarget.checked)}
          />
          <TagsInput
            label="Tags (opsional)"
            placeholder="Ketik lalu Enter"
            value={newTags}
            onChange={setNewTags}
            description="Tag untuk mengelompokkan token"
          />
          <TextInput
            label={`Expired${maxDays > 0 ? ` (maks ${maxDays} hari)` : ' (opsional)'}`}
            placeholder="YYYY-MM-DD"
            type="date"
            value={newExpiry}
            onChange={(e) => setNewExpiry(e.currentTarget.value)}
            min={new Date().toISOString().slice(0, 10)}
            max={maxExpiry ? maxExpiry.toISOString().slice(0, 10) : undefined}
          />
          {create.isError && (
            <Text c="red" size="xs">
              {(create.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={closeCreate}>
              Batal
            </Button>
            <Button loading={create.isPending} disabled={!newName.trim()} onClick={() => create.mutate()}>
              Buat
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!newToken} onClose={resetCreate} title="Token Berhasil Dibuat" size="sm">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Salin token sekarang. Token tidak akan ditampilkan lagi.
          </Text>
          <Box
            p="sm"
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderRadius: 4,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              fontSize: 13,
            }}
          >
            {newToken}
          </Box>
          <Button
            fullWidth
            leftSection={newTokenCb.copied ? <TbCopyCheck size={16} /> : <TbCopy size={16} />}
            color={newTokenCb.copied ? 'green' : 'blue'}
            onClick={() => newTokenCb.copy(newToken!)}
          >
            {newTokenCb.copied ? 'Disalin!' : 'Salin Token'}
          </Button>
        </Stack>
      </Modal>
    </Box>
  )
}
