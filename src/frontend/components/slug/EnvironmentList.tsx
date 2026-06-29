import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Kbd,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  TbInfoCircle,
  TbLayoutGrid,
  TbLayoutList,
  TbPlus,
  TbSearch,
  TbSortAscending,
  TbTag,
  TbVariable,
  TbX,
} from 'react-icons/tb'
import { CreateEnvModal } from '@/frontend/components/slug/CreateEnvModal'
import { EditEnvModal } from '@/frontend/components/slug/EditEnvModal'
import { EnvCard } from '@/frontend/components/slug/EnvCard'
import { ENV_PRESETS, getEnvColor } from '@/frontend/lib/project-utils'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

const HOVER_STYLES = `
.envman-env-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-env-card:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-env-card:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
`

interface Environment {
  id: string
  name: string
  tags: string[]
  createdAt?: string
  _count: { vars: number }
  accessRole?: 'OWNER' | 'EDITOR' | 'VIEWER' | null
}

interface Props {
  slug: string
  envs: Environment[]
  isLoading: boolean
  isOwner: boolean
  canEdit: boolean
  myRole: string
}

export function EnvironmentList({ slug, envs, isLoading, isOwner, canEdit, myRole }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Used only for preset quick-create buttons in empty state
  const addPreset = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/api/envman/projects/${slug}/environments`, { method: 'POST', body: JSON.stringify({ name, tags: [] }) }),
    onSuccess: (_, name) => {
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      notifyOk(`Environment "${name}" ditambahkan`)
      navigate({ to: '/envmanager/$slug/$env', params: { slug, env: name } })
    },
    onError: (e) => notifyErr(e),
  })

  const [envSearch, setEnvSearch] = useState('')
  const [envSort, setEnvSort] = useState<'name' | 'vars' | 'recent'>('name')
  const [envTagFilter, setEnvTagFilter] = useState<string>('')
  const [envGroupByTag, setEnvGroupByTag] = useLocalStorage<boolean>({
    key: 'envman:environments:groupByTag',
    defaultValue: false,
  })
  const [envView, setEnvView] = useLocalStorage<'list' | 'grid'>({
    key: 'envman:environments:view',
    defaultValue: 'list',
  })
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [editEnv, setEditEnv] = useState<Environment | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [debouncedSearch] = useDebouncedValue(envSearch, 120)

  useHotkeys([
    [
      '/',
      () => {
        requestAnimationFrame(() => {
          searchRef.current?.focus()
          searchRef.current?.select()
        })
      },
    ],
  ])

  const allEnvTags = useMemo(() => {
    const set = new Set<string>()
    for (const e of envs) for (const t of e.tags ?? []) set.add(t)
    return [...set].sort()
  }, [envs])

  const filteredEnvs = useMemo(() => {
    let list = [...envs]
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter((e) => e.name.toLowerCase().includes(q))
    }
    if (envTagFilter) list = list.filter((e) => (e.tags ?? []).includes(envTagFilter))
    if (envSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (envSort === 'vars') list.sort((a, b) => (b._count?.vars ?? 0) - (a._count?.vars ?? 0))
    else if (envSort === 'recent') {
      list.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bt - at
      })
    }
    return list
  }, [envs, debouncedSearch, envSort, envTagFilter])

  const otherEnvNames = (currentName: string) => envs.filter((e) => e.name !== currentName).map((e) => e.name)

  const renderGrid = (list: Environment[]) =>
    envView === 'grid' ? (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
        {list.map((e) => (
          <EnvCard
            key={e.name}
            slug={slug}
            env={e}
            otherEnvNames={otherEnvNames(e.name)}
            canEdit={canEdit}
            isOwner={isOwner}
            myRole={myRole}
            onEditClick={setEditEnv}
          />
        ))}
      </SimpleGrid>
    ) : (
      <Stack gap="xs">
        {list.map((e) => (
          <EnvCard
            key={e.name}
            slug={slug}
            env={e}
            otherEnvNames={otherEnvNames(e.name)}
            canEdit={canEdit}
            isOwner={isOwner}
            myRole={myRole}
            onEditClick={setEditEnv}
          />
        ))}
      </Stack>
    )

  const renderGrouped = () => {
    const grouped = new Map<string, Environment[]>()
    const untagged: Environment[] = []
    for (const env of filteredEnvs) {
      if ((env.tags ?? []).length === 0) {
        untagged.push(env)
        continue
      }
      for (const t of env.tags ?? []) {
        if (!grouped.has(t)) grouped.set(t, [])
        grouped.get(t)!.push(env)
      }
    }
    const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
    return (
      <Stack gap="md">
        {groups.map(([tag, tagEnvs]) => (
          <Stack key={tag} gap="xs">
            <Group gap={6} align="center">
              <Badge size="xs" variant="filled" color="grape" leftSection={<TbTag size={9} />}>
                {tag}
              </Badge>
              <Divider style={{ flex: 1 }} />
            </Group>
            {renderGrid(tagEnvs)}
          </Stack>
        ))}
        {untagged.length > 0 && (
          <Stack gap="xs">
            <Group gap={6} align="center">
              <Text size="xs" c="dimmed" fw={500}>
                Lainnya
              </Text>
              <Divider style={{ flex: 1 }} />
            </Group>
            {renderGrid(untagged)}
          </Stack>
        )}
      </Stack>
    )
  }

  return (
    <>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      <Alert
        variant="light"
        color="blue"
        radius="md"
        mb="sm"
        p="xs"
        icon={<TbInfoCircle size={15} />}
        styles={{ message: { fontSize: 'var(--mantine-font-size-xs)' }, body: { gap: 4 } }}
      >
        Environment menyimpan variabel konfigurasi per tahap deployment. Klik environment untuk mengelola vars, atau
        akses dari CLI: <Code fz="xs">envman -e {slug}:production -- bun start</Code>
      </Alert>

      {isLoading ? (
        <Stack gap="xs">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} radius="md" />
          ))}
        </Stack>
      ) : envs.length === 0 ? (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="primary" mx="auto" mb="sm">
            <TbVariable size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Belum ada environment
          </Text>
          <Text size="sm" c="dimmed" mb="md" maw={420} mx="auto">
            Environment adalah wadah untuk environment variables. Biasanya kamu butuh <Code fz="xs">prod</Code>,{' '}
            <Code fz="xs">stg</Code>, dan <Code fz="xs">dev</Code>.
          </Text>
          {canEdit && (
            <>
              <Group justify="center" gap="xs" mb="sm">
                {ENV_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    size="xs"
                    variant="light"
                    color={getEnvColor(preset)}
                    leftSection={<TbPlus size={12} />}
                    onClick={() => addPreset.mutate(preset)}
                    loading={addPreset.isPending && addPreset.variables === preset}
                  >
                    {preset}
                  </Button>
                ))}
              </Group>
              <Button size="xs" variant="subtle" leftSection={<TbPlus size={12} />} onClick={openCreate}>
                Buat nama custom
              </Button>
            </>
          )}
        </Box>
      ) : (
        <>
          <Stack gap="xs" mb="sm">
            {envs.length > 2 && (
              <TextInput
                ref={searchRef}
                size="sm"
                placeholder="Cari environment..."
                leftSection={<TbSearch size={14} />}
                value={envSearch}
                onChange={(e) => setEnvSearch(e.target.value)}
                maw={540}
                rightSection={
                  envSearch ? (
                    <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => setEnvSearch('')}>
                      <TbX size={12} />
                    </ActionIcon>
                  ) : (
                    <Tooltip label="Tekan / untuk focus">
                      <Kbd size="xs">/</Kbd>
                    </Tooltip>
                  )
                }
                rightSectionWidth={36}
                radius="md"
              />
            )}
            <Group gap="xs" wrap="wrap" justify="space-between">
              <Group gap="xs" wrap="wrap">
                {envs.length > 2 && (
                  <Select
                    size="sm"
                    w={155}
                    radius="md"
                    leftSection={<TbSortAscending size={14} />}
                    value={envSort}
                    onChange={(v) => setEnvSort((v ?? 'name') as typeof envSort)}
                    data={[
                      { label: 'Nama A→Z', value: 'name' },
                      { label: 'Terbanyak vars', value: 'vars' },
                      { label: 'Terbaru', value: 'recent' },
                    ]}
                    allowDeselect={false}
                  />
                )}
                <Group gap={4} wrap="nowrap">
                  <Tooltip label="List view" withArrow>
                    <ActionIcon size="sm" variant={envView === 'list' ? 'filled' : 'subtle'} color="blue" onClick={() => setEnvView('list')}>
                      <TbLayoutList size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Grid view" withArrow>
                    <ActionIcon size="sm" variant={envView === 'grid' ? 'filled' : 'subtle'} color="blue" onClick={() => setEnvView('grid')}>
                      <TbLayoutGrid size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {allEnvTags.length > 0 && (
                    <Tooltip label={envGroupByTag ? 'Nonaktifkan grouping' : 'Group by tag'} withArrow>
                      <ActionIcon size="sm" variant={envGroupByTag ? 'filled' : 'subtle'} color="grape" onClick={() => setEnvGroupByTag((v) => !v)}>
                        <TbTag size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
              {canEdit && (
                <Button size="xs" leftSection={<TbPlus size={13} />} onClick={openCreate}>
                  Buat environment
                </Button>
              )}
            </Group>
            {allEnvTags.length > 0 && (
              <Group gap={6} wrap="wrap">
                {allEnvTags.map((t) => (
                  <Badge
                    key={t}
                    size="sm"
                    variant={envTagFilter === t ? 'filled' : 'outline'}
                    color="grape"
                    leftSection={<TbTag size={9} />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setEnvTagFilter((f) => (f === t ? '' : t))}
                  >
                    {t}
                  </Badge>
                ))}
              </Group>
            )}
          </Stack>

          {filteredEnvs.length === 0 ? (
            <Box p="md" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
              <Text size="sm" c="dimmed" mb="xs">
                Tidak ada environment yang cocok dengan "{envSearch}"
              </Text>
              <Button size="xs" variant="subtle" leftSection={<TbX size={11} />} onClick={() => setEnvSearch('')}>
                Reset pencarian
              </Button>
            </Box>
          ) : envGroupByTag && allEnvTags.length > 0 ? (
            renderGrouped()
          ) : (
            renderGrid(filteredEnvs)
          )}
        </>
      )}

      <CreateEnvModal opened={createOpen} onClose={closeCreate} slug={slug} existingNames={envs.map((e) => e.name)} />

      <EditEnvModal editEnv={editEnv} onClose={() => setEditEnv(null)} slug={slug} isOwner={isOwner} />
    </>
  )
}
