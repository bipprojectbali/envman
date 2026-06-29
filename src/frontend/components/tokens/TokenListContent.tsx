import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Kbd,
  Pagination,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useMemo } from 'react'
import {
  TbAlertTriangle,
  TbFilter,
  TbKey,
  TbLayoutGrid,
  TbLayoutList,
  TbPlus,
  TbSearch,
  TbShieldCheck,
  TbSortAscending,
  TbTag,
  TbX,
} from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { NewTokenBanner } from '@/frontend/components/tokens/NewTokenBanner'
import { TokenCard } from '@/frontend/components/tokens/TokenCard'
import { TOKEN_CARD_STYLES, tagColor } from '@/frontend/components/tokens/token-utils'
import type { useTokensPage } from '@/frontend/hooks/useTokensPage'

type TokensPageHook = ReturnType<typeof useTokensPage>

interface TokenListContentProps {
  p: TokensPageHook
}

export function TokenListContent({ p }: TokenListContentProps) {
  const renderTokenCards = (list: typeof p.filteredTokens) =>
    p.view === 'grid' ? (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {list.map((t) => (
          <TokenCard key={t.id} token={t} isUsageOpen={p.expandedUsage.has(t.id)} isCopied={p.copiedId === t.id}
            togglePending={p.toggleToken.isPending && p.toggleToken.variables === t.id}
            copyPending={p.copyToken.isPending && p.copyToken.variables === t.id}
            rotatePending={p.rotateToken.isPending && p.rotateToken.variables === t.id}
            onToggle={() => p.toggleToken.mutate(t.id)} onCopy={() => p.copyToken.mutate(t.id)}
            onRotate={() => p.confirmRotate(t.id, t.name)} onEdit={() => p.goToEdit(t.id)}
            onRevoke={() => p.revokeToken(t.id, t.name)} onUsageToggle={() => p.toggleExpandedUsage(t.id)}
            onCardClick={() => p.goToDetail(t.id)} />
        ))}
      </SimpleGrid>
    ) : (
      <Stack gap="xs">
        {list.map((t) => (
          <TokenCard key={t.id} token={t} compact isUsageOpen={p.expandedUsage.has(t.id)} isCopied={p.copiedId === t.id}
            togglePending={p.toggleToken.isPending && p.toggleToken.variables === t.id}
            copyPending={p.copyToken.isPending && p.copyToken.variables === t.id}
            rotatePending={p.rotateToken.isPending && p.rotateToken.variables === t.id}
            onToggle={() => p.toggleToken.mutate(t.id)} onCopy={() => p.copyToken.mutate(t.id)}
            onRotate={() => p.confirmRotate(t.id, t.name)} onEdit={() => p.goToEdit(t.id)}
            onRevoke={() => p.revokeToken(t.id, t.name)} onUsageToggle={() => p.toggleExpandedUsage(t.id)}
            onCardClick={() => p.goToDetail(t.id)} />
        ))}
      </Stack>
    )

  const groupedRender = useMemo(() => {
    if (!p.groupByTag || p.allTags.length === 0) return null
    const grouped = new Map<string, typeof p.filteredTokens>()
    const untagged: typeof p.filteredTokens = []
    for (const t of p.filteredTokens) {
      if ((t.tags ?? []).length === 0) { untagged.push(t); continue }
      for (const tag of t.tags ?? []) {
        if (!grouped.has(tag)) grouped.set(tag, [])
        grouped.get(tag)!.push(t)
      }
    }
    const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
    return (
      <Stack gap="md">
        {groups.map(([tag, tagTokens]) => (
          <Stack key={tag} gap="xs">
            <Group gap={6} align="center">
              <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>{tag}</Badge>
              <Divider style={{ flex: 1 }} />
            </Group>
            {renderTokenCards(tagTokens)}
          </Stack>
        ))}
        {untagged.length > 0 && (
          <Stack gap="xs">
            <Group gap={6} align="center">
              <Text size="xs" c="dimmed" fw={500}>Tanpa tag</Text>
              <Divider style={{ flex: 1 }} />
            </Group>
            {renderTokenCards(untagged)}
          </Stack>
        )}
      </Stack>
    )
  }, [p.filteredTokens, p.groupByTag, p.allTags, p.view])

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: TOKEN_CARD_STYLES }} />

      <Group justify="space-between" mb="md" wrap="nowrap" align="center">
        <Box style={{ minWidth: 0 }}>
          <Text fw={800} size="xl" lh={1.2}>API Tokens</Text>
          {!p.isLoading && p.tokens.length > 0 && (
            <Group gap={4} mt={2} wrap="wrap">
              <Text size="xs" c="dimmed">{p.tokens.length} token</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{p.activeTokens.length} aktif</Text>
              {p.expiredTokens.length > 0 && <><Text size="xs" c="dimmed">·</Text><Text size="xs" c="dimmed">{p.expiredTokens.length} expired</Text></>}
              {p.disabledTokens.length > 0 && <><Text size="xs" c="dimmed">·</Text><Text size="xs" c="dimmed">{p.disabledTokens.length} disabled</Text></>}
            </Group>
          )}
        </Box>
        {p.canCreateToken && (
          <Button size="sm" leftSection={<TbPlus size={14} />} color="primary" radius="md" onClick={p.goToNew}>Buat Token</Button>
        )}
      </Group>

      {!p.isError && p.tokens.length > 0 && (
        <Stack gap="xs" mb="md">
          <TextInput
            ref={p.searchRef}
            size="sm" placeholder="Cari nama atau scope..."
            leftSection={<TbSearch size={14} />}
            value={p.search} onChange={(e) => p.setSearch(e.target.value)}
            maw={540}
            rightSection={
              p.search ? (
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => p.setSearch('')}><TbX size={12} /></ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus"><Kbd size="xs">/</Kbd></Tooltip>
              )
            }
            rightSectionWidth={36} radius="md"
          />
          <Group gap="xs" wrap="wrap">
            <Tooltip label={p.view === 'list' ? 'Tampilan grid' : 'Tampilan list'}>
              <ActionIcon size="md" variant="default" radius="md" aria-label="Ganti tampilan" onClick={() => p.setView((v) => (v === 'list' ? 'grid' : 'list'))}>
                {p.view === 'list' ? <TbLayoutGrid size={15} /> : <TbLayoutList size={15} />}
              </ActionIcon>
            </Tooltip>
            {p.allTags.length > 0 && (
              <Tooltip label={p.groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'}>
                <ActionIcon size="md" variant={p.groupByTag ? 'filled' : 'default'} radius="md" color={p.groupByTag ? 'grape' : undefined} onClick={() => p.setGroupByTag((v) => !v)}>
                  <TbTag size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <SegmentedControl size="xs" value={p.filterStatus} onChange={p.setFilterStatus} radius="md"
              data={[
                { label: `Semua ${p.tokens.length}`, value: 'semua' },
                { label: `Aktif ${p.activeTokens.length}`, value: 'aktif' },
                { label: `Expired ${p.expiredTokens.length}`, value: 'expired' },
                { label: `Disabled ${p.disabledTokens.length}`, value: 'disabled' },
              ]}
            />
            {p.projects.length > 0 && (
              <MultiSelectChips size="sm" label="Project" icon={<TbFilter size={14} />} width={130}
                options={p.projects.map((proj) => ({ value: proj.slug, label: proj.name }))}
                value={p.filterProjects} onChange={p.setFilterProjects} />
            )}
            {p.allTags.length > 0 && (
              <MultiSelectChips size="sm" label="Tag" icon={<TbTag size={14} />} width={130}
                options={p.allTags} value={p.filterTags} onChange={p.setFilterTags} />
            )}
            <Select size="sm" w={155} leftSection={<TbSortAscending size={14} />} value={p.sort} onChange={(v) => p.setSort(v ?? 'terbaru')} allowDeselect={false} radius="md"
              data={[{ label: 'Terbaru', value: 'terbaru' }, { label: 'Terlama', value: 'terlama' }, { label: 'Nama A→Z', value: 'nama' }, { label: 'Last used', value: 'last_used' }]}
            />
          </Group>
          {p.filterProjects.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow value={p.filterProjects} onChange={p.setFilterProjects} getLabel={(slug) => p.projects.find((proj) => proj.slug === slug)?.name ?? slug} />
            </Group>
          )}
          {p.filterTags.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow value={p.filterTags} onChange={p.setFilterTags} getColor={tagColor} />
            </Group>
          )}
          {p.hasFilter && (
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {p.filteredTokens.length === p.tokens.length ? `${p.tokens.length} token` : `${p.filteredTokens.length} dari ${p.tokens.length} token`}
              </Text>
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={p.resetFilter}>Reset filter</Button>
            </Group>
          )}
        </Stack>
      )}

      <Group gap="xs" mb="md" align="center">
        <TbShieldCheck size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        <Text size="xs" c="dimmed">
          Token CLI untuk autentikasi tanpa password. · <Text span fw={600} c="dimmed">read-only</Text> = pull vars · <Text span fw={600} c="dimmed">read-write</Text> = push vars · Scope kosong = akses semua project
        </Text>
      </Group>

      {p.newToken && <NewTokenBanner token={p.newToken} onDismiss={() => p.setNewToken(null)} />}

      {p.isError && (
        <Box p="xl" ta="center" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm"><TbAlertTriangle size={24} /></ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat tokens</Text>
          <Text size="sm" c="dimmed" mb="md">{(p.error as Error)?.message ?? 'Terjadi kesalahan.'}</Text>
          <Button size="xs" variant="light" color="red" onClick={() => p.refetch()}>Coba lagi</Button>
        </Box>
      )}

      {!p.isError && (
        p.isLoading ? (
          p.view === 'grid'
            ? <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">{[0,1,2,3].map((i) => <Skeleton key={i} height={140} radius="md" />)}</SimpleGrid>
            : <Stack gap="xs">{[0,1,2,3].map((i) => <Skeleton key={i} height={76} radius="md" />)}</Stack>
        ) : p.tokens.length === 0 ? (
          <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm"><TbKey size={24} /></ThemeIcon>
            <Text fw={600} mb={4}>Belum ada API token</Text>
            <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">Token dipakai CLI untuk login tanpa password. Cocok untuk CI/CD, deploy script, atau development.</Text>
            {p.canCreateToken ? (
              <Button size="sm" color="primary" leftSection={<TbPlus size={14} />} onClick={p.goToNew}>Buat Token Pertama</Button>
            ) : (
              <Text size="xs" c="dimmed">Tidak punya izin create API token. Hubungi SUPER_ADMIN.</Text>
            )}
          </Box>
        ) : p.filteredTokens.length === 0 ? (
          <Box p="lg" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm"><TbSearch size={22} /></ThemeIcon>
            <Text fw={600} mb={4}>Tidak ada hasil</Text>
            <Text size="sm" c="dimmed" mb="md">Tidak ada token yang cocok dengan filter.</Text>
            <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={p.resetFilter}>Reset filter</Button>
          </Box>
        ) : groupedRender ? (
          <>
            {groupedRender}
            {p.tokensTotalPages > 1 && <Group justify="center" mt="sm"><Pagination value={p.tokensPage} onChange={p.setTokensPage} total={p.tokensTotalPages} size="sm" /></Group>}
          </>
        ) : (
          <>
            {renderTokenCards(p.paginatedTokens)}
            {p.tokensTotalPages > 1 && <Group justify="center" mt="sm"><Pagination value={p.tokensPage} onChange={p.setTokensPage} total={p.tokensTotalPages} size="sm" /></Group>}
          </>
        )
      )}
    </Box>
  )
}
