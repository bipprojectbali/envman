import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCopy, TbCopyCheck, TbKey, TbPlus } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { type Token, TokenCard, TokenRow } from './ProfileTokenCard'
import { ProfileTokensToolbar, type ViewMode } from './ProfileTokensToolbar'

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
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('profile:tokens:viewMode') as ViewMode) ?? 'list')
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
  const resetCreate = () => { setNewToken(null); setNewName(''); setNewWrite(false); setNewExpiry(''); setNewTags([]); closeCreate() }

  const create = useMutation({
    mutationFn: () => apiFetch<{ token: string }>('/api/envman/tokens', { method: 'POST', body: JSON.stringify({ name: newName, canWrite: newWrite, expiresAt: newExpiry || null, tags: newTags }) }),
    onSuccess: (d) => { setNewToken(d.token); invalidate() },
  })
  const toggle = useMutation({ mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }), onSuccess: invalidate })
  const rotate = useMutation({ mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/rotate`, { method: 'POST' }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}`, { method: 'DELETE' }), onSuccess: invalidate })

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

  const groups: { label: string; tokens: Token[] }[] = groupByTag
    ? [
        ...(allTags.length > 0
          ? allTags.filter((tag) => selectedTags.length === 0 || selectedTags.includes(tag)).map((tag) => ({ label: tag, tokens: filtered.filter((t) => t.tags.includes(tag)) })).filter((g) => g.tokens.length > 0)
          : []),
        { label: 'Lainnya', tokens: filtered.filter((t) => t.tags.length === 0) },
      ].filter((g) => g.tokens.length > 0)
    : [{ label: '', tokens: filtered }]

  return (
    <Box p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <TbKey size={15} />
          <Text fw={600} size="sm">API Tokens</Text>
          {allTokens.length > 0 && <Badge size="xs" variant="light" color="gray">{allTokens.length}</Badge>}
        </Group>
        {creationAllowed && (
          <Button size="xs" leftSection={<TbPlus size={14} />} onClick={openCreate}>Buat Token</Button>
        )}
      </Group>
      <Divider mb="sm" />

      {isLoading ? (
        <Text c="dimmed" size="xs">Loading...</Text>
      ) : !allTokens.length ? (
        <Text c="dimmed" size="xs" ta="center" py="sm">
          {creationAllowed ? 'Belum ada token. Buat token untuk akses API.' : 'Pembuatan token dinonaktifkan oleh administrator.'}
        </Text>
      ) : (
        <Stack gap="sm">
          <ProfileTokensToolbar
            search={search} onSearch={setSearch}
            dateFrom={dateFrom} dateTo={dateTo} onDateFrom={setDateFrom} onDateTo={setDateTo}
            allTags={allTags} selectedTags={selectedTags}
            onToggleTag={(tag) => setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
            groupByTag={groupByTag} onGroupByTag={(v) => { setGroupByTag(v); localStorage.setItem('profile:tokens:groupByTag', String(v)) }}
            viewMode={viewMode} onViewMode={(v) => { setViewMode(v); localStorage.setItem('profile:tokens:viewMode', v) }}
          />

          {groups.map((g) => (
            <Box key={g.label}>
              {groupByTag && g.label && (
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={6} style={{ letterSpacing: '0.05em' }}>
                  {g.label} <Badge size="xs" variant="light" color="gray" ml={4}>{g.tokens.length}</Badge>
                </Text>
              )}
              {viewMode === 'grid' ? (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} mb={groupByTag ? 'sm' : 0}>
                  {g.tokens.map((t) => <TokenCard key={t.id} t={t} toggle={toggle.mutate} rotate={rotate.mutate} remove={remove.mutate} />)}
                </SimpleGrid>
              ) : (
                g.tokens.map((t) => <TokenRow key={t.id} t={t} toggle={toggle.mutate} rotate={rotate.mutate} remove={remove.mutate} />)
              )}
            </Box>
          ))}

          {filtered.length === 0 && <Text c="dimmed" size="xs" ta="center" py="sm">Tidak ada token yang cocok dengan filter.</Text>}
        </Stack>
      )}

      <Modal opened={createOpen && !newToken} onClose={closeCreate} title="Buat Token Baru" size="sm">
        <Stack gap="sm">
          <TextInput label="Nama" placeholder="misal: laptop-dev" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} required />
          <Switch label="Read-Write" description="Izinkan token untuk menulis/mengubah vars" checked={newWrite} onChange={(e) => setNewWrite(e.currentTarget.checked)} />
          <TagsInput label="Tags (opsional)" placeholder="Ketik lalu Enter" value={newTags} onChange={setNewTags} description="Tag untuk mengelompokkan token" />
          <TextInput label={`Expired${maxDays > 0 ? ` (maks ${maxDays} hari)` : ' (opsional)'}`} placeholder="YYYY-MM-DD" type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.currentTarget.value)} min={new Date().toISOString().slice(0, 10)} max={maxExpiry ? maxExpiry.toISOString().slice(0, 10) : undefined} />
          {create.isError && <Text c="red" size="xs">{(create.error as Error).message}</Text>}
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={closeCreate}>Batal</Button>
            <Button loading={create.isPending} disabled={!newName.trim()} onClick={() => create.mutate()}>Buat</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!newToken} onClose={resetCreate} title="Token Berhasil Dibuat" size="sm">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">Salin token sekarang. Token tidak akan ditampilkan lagi.</Text>
          <Box p="sm" style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 4, fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 13 }}>
            {newToken}
          </Box>
          <Button fullWidth leftSection={newTokenCb.copied ? <TbCopyCheck size={16} /> : <TbCopy size={16} />} color={newTokenCb.copied ? 'green' : 'blue'} onClick={() => newTokenCb.copy(newToken!)}>
            {newTokenCb.copied ? 'Disalin!' : 'Salin Token'}
          </Button>
        </Stack>
      </Modal>
    </Box>
  )
}
