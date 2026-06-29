import {
  ActionIcon,
  Badge,
  Box,
  Checkbox,
  Code,
  Collapse,
  Group,
  Pagination,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useState } from 'react'
import { TbChevronDown, TbChevronRight, TbLayoutGrid, TbLayoutList, TbSearch, TbVariable, TbX } from 'react-icons/tb'

export interface ProjectOption {
  slug: string
  name: string
  environments: { name: string }[]
}

interface Props {
  projects: ProjectOption[]
  value: string[]
  onChange: (v: string[]) => void
}

const SCOPE_PER_PAGE = 6

export function ScopeSelector({ projects, value, onChange }: Props) {
  const allAccess = value.length === 0
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scopeView, setScopeView] = useState<'list' | 'grid'>('list')
  const [scopePage, setScopePage] = useState(1)
  const [scopeSearch, setScopeSearch] = useState('')

  const filteredProjects = scopeSearch.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(scopeSearch.toLowerCase()) ||
          p.slug.toLowerCase().includes(scopeSearch.toLowerCase()),
      )
    : projects

  const totalPages = Math.ceil(filteredProjects.length / SCOPE_PER_PAGE)
  const paginatedProjects = filteredProjects.slice((scopePage - 1) * SCOPE_PER_PAGE, scopePage * SCOPE_PER_PAGE)

  const toggleExpand = (slug: string) =>
    setExpanded((prev) => {
      const s = new Set(prev)
      s.has(slug) ? s.delete(slug) : s.add(slug)
      return s
    })

  const toggleScope = (scope: string) => {
    if (allAccess) { onChange([scope]); return }
    if (value.includes(scope)) onChange(value.filter((s) => s !== scope))
    else onChange([...value, scope])
  }

  const toggleProject = (p: ProjectOption) => {
    const projectScopes = p.environments.map((e) => `${p.slug}:${e.name}`)
    if (allAccess) { onChange(projectScopes); return }
    const allSelected = projectScopes.every((s) => value.includes(s))
    if (allSelected) onChange(value.filter((s) => !projectScopes.includes(s)))
    else onChange([...value.filter((s) => !projectScopes.includes(s)), ...projectScopes])
  }

  if (projects.length === 0)
    return <Text size="xs" c="dimmed">Belum ada project — token akan punya akses global.</Text>

  const renderListItem = (p: ProjectOption) => {
    const projectScopes = p.environments.map((e) => `${p.slug}:${e.name}`)
    const selectedCount = allAccess ? 0 : projectScopes.filter((s) => value.includes(s)).length
    const allSelected = !allAccess && selectedCount === projectScopes.length && projectScopes.length > 0
    const someSelected = !allAccess && selectedCount > 0 && !allSelected
    const isOpen = expanded.has(p.slug)
    return (
      <Box
        key={p.slug}
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
          overflow: 'hidden',
          opacity: allAccess ? 0.55 : 1,
        }}
      >
        <Group
          gap="xs"
          p="xs"
          style={{
            cursor: 'pointer',
            background: someSelected || allSelected ? 'var(--mantine-color-violet-light)' : undefined,
          }}
          onClick={() => { if (p.environments.length > 0) toggleExpand(p.slug) }}
        >
          <Checkbox
            size="xs"
            checked={allSelected}
            indeterminate={someSelected}
            onChange={() => toggleProject(p)}
            onClick={(e) => { e.stopPropagation(); toggleProject(p) }}
          />
          <TbVariable size={13} style={{ color: 'var(--mantine-color-primary)' }} />
          <Text size="xs" fw={600} style={{ flex: 1 }}>{p.name}</Text>
          <Code fz="xs" c="dimmed">{p.slug}</Code>
          {selectedCount > 0 && (
            <Badge size="xs" color="primary" variant="filled">{selectedCount}/{projectScopes.length}</Badge>
          )}
          {p.environments.length > 0 && (isOpen ? <TbChevronDown size={13} /> : <TbChevronRight size={13} />)}
        </Group>
        <Collapse in={isOpen}>
          <Stack gap={0} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {p.environments.map((e) => {
              const scope = `${p.slug}:${e.name}`
              const checked = !allAccess && value.includes(scope)
              return (
                <Group
                  key={e.name}
                  gap="xs"
                  px="sm"
                  py={6}
                  style={{ cursor: 'pointer', background: checked ? 'var(--mantine-color-violet-light)' : undefined }}
                  onClick={() => toggleScope(scope)}
                >
                  <Checkbox size="xs" checked={checked} onChange={() => toggleScope(scope)} onClick={(e) => e.stopPropagation()} />
                  <Code fz="xs">{e.name}</Code>
                  <Text size="xs" c="dimmed" style={{ flex: 1 }}>{scope}</Text>
                </Group>
              )
            })}
            {p.environments.length === 0 && (
              <Text size="xs" c="dimmed" px="sm" py={6}>Belum ada environment</Text>
            )}
          </Stack>
        </Collapse>
      </Box>
    )
  }

  const renderGridItem = (p: ProjectOption) => {
    const projectScopes = p.environments.map((e) => `${p.slug}:${e.name}`)
    const selectedCount = allAccess ? 0 : projectScopes.filter((s) => value.includes(s)).length
    const allSelected = !allAccess && selectedCount === projectScopes.length && projectScopes.length > 0
    const someSelected = !allAccess && selectedCount > 0 && !allSelected
    return (
      <Box
        key={p.slug}
        p="xs"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: `1px solid ${allSelected ? 'var(--mantine-color-primary)' : 'var(--mantine-color-default-border)'}`,
          opacity: allAccess ? 0.55 : 1,
          background: allSelected || someSelected ? 'var(--mantine-color-violet-light)' : undefined,
        }}
      >
        <Group gap="xs" mb={6} wrap="nowrap">
          <Checkbox size="xs" checked={allSelected} indeterminate={someSelected} onChange={() => toggleProject(p)} />
          <TbVariable size={12} style={{ color: 'var(--mantine-color-primary)', flexShrink: 0 }} />
          <Text size="xs" fw={700} truncate style={{ flex: 1 }}>{p.name}</Text>
          <Code fz="xs" c="dimmed">{p.slug}</Code>
        </Group>
        {p.environments.length === 0 ? (
          <Text size="xs" c="dimmed" fs="italic">Belum ada environment</Text>
        ) : (
          <Group gap={4} wrap="wrap">
            {p.environments.map((e) => {
              const scope = `${p.slug}:${e.name}`
              const checked = !allAccess && value.includes(scope)
              return (
                <Badge
                  key={e.name}
                  size="xs"
                  variant={checked ? 'filled' : 'outline'}
                  color={checked ? 'primary' : 'gray'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleScope(scope)}
                >
                  {e.name}
                </Badge>
              )
            })}
          </Group>
        )}
        {selectedCount > 0 && (
          <Text size="xs" c="primary" mt={4}>{selectedCount}/{projectScopes.length} dipilih</Text>
        )}
      </Box>
    )
  }

  return (
    <Stack gap={6}>
      <Box
        p="xs"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: `1px solid ${allAccess ? 'var(--mantine-color-primary)' : 'var(--mantine-color-default-border)'}`,
          cursor: allAccess ? 'default' : 'pointer',
          background: allAccess ? 'var(--mantine-color-violet-light)' : undefined,
        }}
        onClick={() => { if (!allAccess) onChange([]) }}
      >
        <Group gap="xs">
          <Checkbox size="xs" readOnly checked={allAccess} />
          <Box style={{ flex: 1 }}>
            <Text size="xs" fw={600}>Semua project</Text>
            <Text size="xs" c="dimmed">Akses ke semua project yang kamu miliki — tidak dibatasi</Text>
          </Box>
          {!allAccess && <Badge size="xs" color="gray" variant="outline">klik untuk reset</Badge>}
        </Group>
      </Box>

      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="xs"
          placeholder="Cari project..."
          leftSection={<TbSearch size={12} />}
          value={scopeSearch}
          onChange={(e) => { setScopeSearch(e.target.value); setScopePage(1) }}
          rightSection={
            scopeSearch ? (
              <ActionIcon size="xs" variant="subtle" onClick={() => { setScopeSearch(''); setScopePage(1) }}>
                <TbX size={11} />
              </ActionIcon>
            ) : null
          }
          style={{ flex: 1 }}
        />
        <Group gap={2} style={{ flexShrink: 0 }}>
          <ActionIcon
            size="xs"
            variant={scopeView === 'list' ? 'filled' : 'subtle'}
            color="gray"
            radius="sm"
            onClick={() => { setScopeView('list'); setScopePage(1) }}
            aria-label="Tampilan list"
          >
            <TbLayoutList size={12} />
          </ActionIcon>
          <ActionIcon
            size="xs"
            variant={scopeView === 'grid' ? 'filled' : 'subtle'}
            color="gray"
            radius="sm"
            onClick={() => { setScopeView('grid'); setScopePage(1) }}
            aria-label="Tampilan grid"
          >
            <TbLayoutGrid size={12} />
          </ActionIcon>
        </Group>
      </Group>
      {filteredProjects.length < projects.length && (
        <Text size="xs" c="dimmed">
          {filteredProjects.length} dari {projects.length} project
          {!allAccess && value.length > 0 && ` · ${value.length} scope dipilih`}
        </Text>
      )}

      {filteredProjects.length === 0 ? (
        <Text size="xs" c="dimmed" ta="center" py="xs">Tidak ada project yang cocok.</Text>
      ) : scopeView === 'list' ? (
        <Stack gap={4}>{paginatedProjects.map(renderListItem)}</Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
          {paginatedProjects.map(renderGridItem)}
        </SimpleGrid>
      )}

      {totalPages > 1 && (
        <Group justify="center">
          <Pagination value={scopePage} onChange={setScopePage} total={totalPages} size="xs" withEdges />
        </Group>
      )}

      {!allAccess && value.length === 0 && (
        <Text size="xs" c="dimmed">Pilih minimal satu environment, atau klik "Semua project" di atas.</Text>
      )}
    </Stack>
  )
}
