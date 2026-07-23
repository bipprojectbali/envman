import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { TbArrowRight, TbBan, TbSearch, TbShieldCheck, TbX } from 'react-icons/tb'
import { AccessStatsHeader, computeStats } from './AccessStatsHeader'
import type { ProjectAccess } from './types'
import { ROLE_COLOR } from './types'

type FilterKey = 'with-access' | 'override'

const hasAnyOverride = (p: ProjectAccess) => p.environments.some((e) => e.envRole !== 'inherit')
// Benar-benar bisa menyentuh sesuatu: punya role project, ATAU override env
// berupa role (bukan denied). Project NO ROLE tanpa akses efektif tak ditampilkan.
const hasEffectiveAccess = (p: ProjectAccess) =>
  p.projectRole !== null ||
  p.environments.some((e) => e.envRole === 'OWNER' || e.envRole === 'EDITOR' || e.envRole === 'VIEWER')

function envCounts(envs: ProjectAccess['environments']) {
  let denied = 0
  let override = 0
  for (const e of envs) {
    if (e.envRole === 'denied') denied++
    else if (e.envRole !== 'inherit') override++
  }
  return { denied, override }
}

// Ringkasan akses per-user READ-ONLY. Semua penyuntingan role/override kini
// dilakukan di satu tempat: tab Members tiap project (single source of truth).
// Tab ini hanya lensa audit "apa yang bisa diakses user ini" lintas project,
// tiap baris deep-link ke tab Members project untuk mengedit.
export function AccessMatrixTab({ projects }: { projects: ProjectAccess[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('with-access')

  const stats = useMemo(() => computeStats(projects), [projects])

  // Basis view: HANYA project yang user benar-benar bisa akses. Project NO ROLE
  // (mayoritas) tak pernah ditampilkan — noise untuk audit, bukan sinyal.
  const accessible = useMemo(() => projects.filter(hasEffectiveAccess), [projects])
  const overrideCount = useMemo(() => accessible.filter(hasAnyOverride).length, [accessible])

  const filtered = useMemo(() => {
    let list = accessible
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    if (filter === 'override') list = list.filter(hasAnyOverride)
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [accessible, search, filter])

  return (
    <Stack gap="sm">
      <AccessStatsHeader stats={stats} />

      <Text size="xs" c="dimmed">
        Ringkasan akses (read-only). Untuk mengubah role atau override, buka tab <strong>Members</strong> di project
        terkait — di sanalah semua akses diatur.
      </Text>

      <Group gap="xs" wrap="nowrap">
        <TextInput
          placeholder="Cari project (nama atau slug)…"
          leftSection={<TbSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size="sm"
          style={{ flex: 1 }}
          rightSection={
            search ? (
              <ActionIcon size="xs" variant="subtle" onClick={() => setSearch('')}>
                <TbX size={11} />
              </ActionIcon>
            ) : undefined
          }
        />
      </Group>

      <SegmentedControl
        size="xs"
        value={filter}
        onChange={(v) => setFilter(v as FilterKey)}
        data={[
          { value: 'with-access', label: `Punya akses (${accessible.length})` },
          { value: 'override', label: `Ada override (${overrideCount})` },
        ]}
      />

      {filtered.length > 0 ? (
        <Box
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Project</Table.Th>
                <Table.Th w={110}>Role</Table.Th>
                <Table.Th w={70} ta="center">
                  Env
                </Table.Th>
                <Table.Th w={90} ta="center">
                  Override
                </Table.Th>
                <Table.Th w={80} ta="center">
                  Denied
                </Table.Th>
                <Table.Th w={44} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((p) => {
                const c = envCounts(p.environments)
                return (
                  <Table.Tr
                    key={p.slug}
                    onClick={() => {
                      window.location.href = `/envmanager/${p.slug}?tab=members`
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Text size="sm" fw={600} truncate>
                        {p.name}
                      </Text>
                      <Text span fz={9} c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                        {p.slug}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {p.projectRole ? (
                        <Badge size="sm" color={ROLE_COLOR[p.projectRole]} variant="light">
                          {p.projectRole}
                        </Badge>
                      ) : (
                        <Badge size="sm" color="gray" variant="outline" leftSection={<TbBan size={9} />}>
                          no role
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Text size="xs" c="dimmed">
                        {p.environments.length}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="center">
                      {c.override > 0 ? (
                        <Badge size="sm" color="orange" variant="light">
                          {c.override}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      {c.denied > 0 ? (
                        <Badge size="sm" color="red" variant="light">
                          {c.denied}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      <ThemeIcon size={18} radius="sm" variant="subtle" color="gray">
                        <TbArrowRight size={13} />
                      </ThemeIcon>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Box>
      ) : (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)' }}>
          <ThemeIcon size={32} radius="xl" variant="light" color="gray" mx="auto" mb="xs">
            <TbShieldCheck size={16} />
          </ThemeIcon>
          <Text size="sm" fw={500}>
            Tidak ada project yang cocok
          </Text>
          <Text size="xs" c="dimmed">
            {filter === 'with-access' && !search
              ? 'User ini belum punya akses ke project mana pun.'
              : 'Coba ubah filter atau hapus kata kunci.'}
          </Text>
          {(search || filter !== 'with-access') && (
            <Button
              size="xs"
              variant="subtle"
              mt="xs"
              onClick={() => {
                setSearch('')
                setFilter('with-access')
              }}
            >
              Reset filter
            </Button>
          )}
        </Box>
      )}
    </Stack>
  )
}
