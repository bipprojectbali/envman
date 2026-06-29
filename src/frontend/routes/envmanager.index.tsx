import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Kbd,
  Pagination,
  Paper,
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
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbArrowsSort,
  TbChevronLeft,
  TbChevronRight,
  TbFolders,
  TbLayoutGrid,
  TbLayoutList,
  TbPlus,
  TbPower,
  TbSearch,
  TbTag,
  TbTrash,
  TbX,
} from 'react-icons/tb'
import { MultiSelectChips, MultiSelectChipsRow } from '@/frontend/components/MultiSelectChips'
import { CreateProjectForm } from '@/frontend/components/projects/CreateProjectForm'
import { DeleteProjectConfirm } from '@/frontend/components/projects/DeleteProjectConfirm'
import { EditProjectForm } from '@/frontend/components/projects/EditProjectForm'
import { ProjectGridCard } from '@/frontend/components/projects/ProjectGridCard'
import { ProjectListCard } from '@/frontend/components/projects/ProjectListCard'
import { useProjectList, SORT_OPTIONS } from '@/frontend/hooks/useProjectList'
import { apiFetch } from '@/frontend/lib/api'
import { groupByPrimaryTag, tagColor } from '@/frontend/lib/project-utils'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

export const Route = createFileRoute('/envmanager/')({
  component: ProjectListPage,
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === true || search.create === 'true',
    editSlug: typeof search.editSlug === 'string' ? search.editSlug : (undefined as string | undefined),
  }),
})

const HOVER_STYLES = `
.envman-project-card {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-project-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--mantine-color-primary) 50%, transparent);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-project-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--mantine-color-primary) 50%, transparent);
  outline-offset: 2px;
  border-color: color-mix(in srgb, var(--mantine-color-primary) 50%, transparent);
}
.envman-tag-chip {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.envman-tag-chip:hover {
  transform: scale(1.05);
}
`

function ProjectListPage() {
  const qc = useQueryClient()
  const {
    create, editSlug,
    form, setForm, slugManual, setSlugManual,
    view, setView, search, setSearch, tagFilter, setTagFilter, sort, setSort,
    pinned, setPinned, groupByTag, setGroupByTag, statusFilter, setStatusFilter,
    page, setPage, searchRef,
    projects, isLoading, isError, error, refetch,
    createProject, editProject, toggleActive,
    allTags, filtered, paginatedGroups, totalPages,
    ownerCount, totalEnvs, hasFilter, canCreateProject,
    togglePin, addTagFilter, resetFilter,
    openProject, openCreatePage, openEditPage, closeFormPage,
  } = useProjectList()

  const confirmToggleActive = (slug: string, name: string, currentActive: boolean) => {
    modals.openConfirmModal({
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color={currentActive ? 'orange' : 'teal'} radius="md">
            <TbPower size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            {currentActive ? 'Nonaktifkan project' : 'Aktifkan project'}
          </Text>
        </Group>
      ),
      children: (
        <Text size="sm">
          {currentActive ? (
            <>
              Project <strong>{name}</strong> akan dinonaktifkan. Environment dan variabelnya tetap tersimpan, tapi
              project tidak akan muncul di filter "Aktif".
            </>
          ) : (
            <>
              Project <strong>{name}</strong> akan diaktifkan kembali.
            </>
          )}
        </Text>
      ),
      labels: { confirm: currentActive ? 'Nonaktifkan' : 'Aktifkan', cancel: 'Batal' },
      confirmProps: { color: currentActive ? 'orange' : 'teal' },
      onConfirm: () => toggleActive.mutate({ slug, isActive: !currentActive }),
    })
  }

  const deleteProject = (slug: string, name: string) => {
    const id = `delete-project-${slug}`
    modals.open({
      modalId: id,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Hapus project
          </Text>
        </Group>
      ),
      children: (
        <DeleteProjectConfirm
          name={name}
          slug={slug}
          onCancel={() => modals.close(id)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/projects/${slug}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
              setPinned((prev) => prev.filter((s) => s !== slug))
              notifyOk(`Project "${name}" dihapus`)
              modals.close(id)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  if (create) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="lg">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeFormPage}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeFormPage}>
              Projects
            </Anchor>
            <TbChevronRight size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
            <Text size="sm" fw={600}>
              Buat Project Baru
            </Text>
          </Group>
          <Divider />
          <CreateProjectForm
            form={form}
            setForm={setForm}
            slugManual={slugManual}
            setSlugManual={setSlugManual}
            allTagValues={allTags.map((t) => t.value)}
            existingSlugs={projects.map((p) => p.slug)}
            isPending={createProject.isPending}
            onClose={closeFormPage}
            onSubmit={() => createProject.mutate(form)}
          />
        </Stack>
      </Paper>
    )
  }

  if (editSlug) {
    const editingProject = projects.find((p) => p.slug === editSlug)
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="lg">
          <Group gap={6} align="center">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeFormPage}>
              <TbChevronLeft size={15} />
            </ActionIcon>
            <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeFormPage}>
              Projects
            </Anchor>
            <TbChevronRight size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
            <Text size="sm" fw={600}>
              {editingProject ? `Edit: ${editingProject.name}` : '...'}
            </Text>
          </Group>
          <Divider />
          {isLoading || !editingProject ? (
            <Skeleton height={400} radius="md" />
          ) : (
            <EditProjectForm
              key={editSlug}
              project={editingProject}
              allTagValues={allTags.map((t) => t.value)}
              isPending={editProject.isPending}
              onClose={closeFormPage}
              onSubmit={(data) => editProject.mutate(data)}
            />
          )}
        </Stack>
      </Paper>
    )
  }

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover effects */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      <Group justify="space-between" mb="md" gap="xs" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fw={800} size="xl" lh={1.2}>
            Projects
          </Text>
          {!isLoading && !isError && projects.length > 0 && (
            <Group gap={4} mt={2} wrap="wrap">
              <Text size="xs" c="dimmed">{projects.length} project</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{totalEnvs} environment</Text>
              {ownerCount > 0 && (
                <>
                  <Text size="xs" c="dimmed">·</Text>
                  <Text size="xs" c="dimmed">{ownerCount} milik saya</Text>
                </>
              )}
            </Group>
          )}
        </Box>
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          {canCreateProject && (
            <Button size="sm" leftSection={<TbPlus size={14} />} color="primary" onClick={openCreatePage} radius="md">
              New Project
            </Button>
          )}
        </Group>
      </Group>

      {!isLoading && !isError && (
        <Alert variant="light" color="violet" mb="md" p="sm" radius="md" icon={<TbFolders size={16} />}>
          <Text size="sm" fw={500} mb={4}>Apa itu Projects?</Text>
          <Text size="xs" c="dimmed" lh={1.6}>
            Projects adalah unit kerja utama — setiap project punya beberapa <strong>environment</strong> (mis.{' '}
            <Code fz="xs">dev</Code>, <Code fz="xs">staging</Code>, <Code fz="xs">production</Code>) yang masing-masing
            menyimpan <strong>env vars</strong>. Member bisa di-assign sebagai <strong>Owner</strong>,{' '}
            <strong>Editor</strong>, atau <strong>Viewer</strong>. Gunakan <Kbd size="xs">K</Kbd> atau{' '}
            <Kbd size="xs">/</Kbd> untuk cari cepat, pin project favorit, dan filter berdasarkan tag atau status aktif.
          </Text>
        </Alert>
      )}

      {!isLoading && !isError && projects.length > 0 && (
        <Stack gap="xs" mb="md">
          <TextInput
            ref={searchRef}
            size="sm"
            placeholder="Cari project, slug, deskripsi, atau tag..."
            leftSection={<TbSearch size={14} />}
            maw={540}
            rightSection={
              search ? (
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                  <TbX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label="Tekan / untuk focus"><Kbd size="xs">/</Kbd></Tooltip>
              )
            }
            rightSectionWidth={36}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            radius="md"
          />
          <Group gap="xs" wrap="wrap">
            <Tooltip label={view === 'grid' ? 'Tampilan list' : 'Tampilan grid'}>
              <ActionIcon size="md" variant="default" radius="md" aria-label="Ganti tampilan" onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}>
                {view === 'grid' ? <TbLayoutList size={15} /> : <TbLayoutGrid size={15} />}
              </ActionIcon>
            </Tooltip>
            {allTags.length > 0 && (
              <Tooltip label={groupByTag ? 'Nonaktifkan group by tag' : 'Group by tag'}>
                <ActionIcon size="md" variant={groupByTag ? 'filled' : 'default'} radius="md" color={groupByTag ? 'grape' : undefined} onClick={() => setGroupByTag((v) => !v)}>
                  <TbTag size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            {allTags.length > 0 && (
              <MultiSelectChips size="sm" label="Tag" icon={<TbTag size={14} />} width={130} options={allTags} value={tagFilter} onChange={setTagFilter} />
            )}
            <Select size="sm" data={SORT_OPTIONS} value={sort} onChange={(v) => v && setSort(v as typeof sort)} leftSection={<TbArrowsSort size={14} />} allowDeselect={false} w={155} radius="md" />
            <SegmentedControl size="xs" value={statusFilter} onChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}
              data={[{ value: 'all', label: 'Semua' }, { value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }]} radius="md" />
          </Group>
          {tagFilter.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <MultiSelectChipsRow value={tagFilter} onChange={setTagFilter} getColor={tagColor} />
            </Group>
          )}
          {hasFilter && (
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {filtered.length === projects.length ? `${projects.length} project` : `${filtered.length} dari ${projects.length} project`}
              </Text>
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<TbX size={11} />} onClick={resetFilter}>
                Reset filter
              </Button>
            </Group>
          )}
        </Stack>
      )}

      {isError && (
        <Box p="xl" ta="center" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid color-mix(in srgb, var(--mantine-color-red-5) 35%, transparent)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm"><TbAlertTriangle size={24} /></ThemeIcon>
          <Text fw={600} mb={4}>Gagal memuat project</Text>
          <Text size="sm" c="dimmed" mb="md">{(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar project.'}</Text>
          <Button size="xs" variant="light" color="red" onClick={() => refetch()}>Coba lagi</Button>
        </Box>
      )}

      {isLoading && (
        view === 'grid' ? (
          <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={172} radius="md" />)}
          </SimpleGrid>
        ) : (
          <Stack gap="xs">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={76} radius="md" />)}
          </Stack>
        )
      )}

      {!isLoading && !isError && projects.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
          <ThemeIcon size={56} radius="xl" variant="light" color="primary" mx="auto" mb="md"><TbFolders size={28} /></ThemeIcon>
          <Text fw={600} size="md" mb={6}>Belum ada project</Text>
          {canCreateProject ? (
            <>
              <Text size="sm" c="dimmed" mb="lg" maw={420} mx="auto">
                Buat project pertama untuk mulai mengelola environment variables. Setiap project bisa punya beberapa
                environment (<Code fz="xs">dev</Code>, <Code fz="xs">stg</Code>, <Code fz="xs">prod</Code>) yang
                masing-masing menyimpan variabel sendiri.
              </Text>
              <Button leftSection={<TbPlus size={14} />} color="primary" onClick={openCreatePage}>Buat Project Pertama</Button>
            </>
          ) : (
            <Text size="sm" c="dimmed" maw={400} mx="auto">Kamu belum ditambahkan ke project manapun. Minta admin untuk mengundangmu ke project.</Text>
          )}
        </Box>
      )}

      {!isLoading && !isError && projects.length > 0 && filtered.length === 0 && (
        <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm"><TbSearch size={24} /></ThemeIcon>
          <Text fw={600} mb={4}>Tidak ada hasil</Text>
          <Text size="sm" c="dimmed" mb="md">Tidak ada project yang cocok dengan filter saat ini.</Text>
          <Button size="xs" variant="subtle" leftSection={<TbX size={12} />} onClick={resetFilter}>Reset filter</Button>
        </Box>
      )}

      {!isError && filtered.length > 0 && (
        <>
          <Stack gap="md">
            {paginatedGroups.map((group, gi) => (
              <Box key={group.key}>
                {group.label && (
                  <Group gap="xs" mb="xs" mt={gi > 0 ? 4 : 0} align="center">
                    <Text size="xs" fw={700} tt="uppercase" c={group.key === 'pinned' ? 'violet.6' : 'dimmed'} style={{ letterSpacing: '0.06em' }}>
                      {group.label}
                    </Text>
                    <Badge size="xs" variant="light" radius="sm" color={group.key === 'pinned' ? 'violet' : group.key === 'inactive' ? 'gray' : 'teal'}>
                      {group.items.length}
                    </Badge>
                    <Box style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)' }} />
                  </Group>
                )}
                {(() => {
                  const tagGroups = groupByTag ? groupByPrimaryTag(group.items) : [{ tag: null, items: group.items }]
                  const hasSubGroups = groupByTag && tagGroups.length > 1
                  return (
                    <Stack gap={hasSubGroups ? 'sm' : 'xs'}>
                      {tagGroups.map((tg) => (
                        <Box key={tg.tag ?? '__no_tag__'}>
                          {hasSubGroups && (
                            <Group gap="xs" mb="xs" align="center">
                              {tg.tag ? (
                                <Badge size="xs" variant="dot" color={tagColor(tg.tag)}>{tg.tag}</Badge>
                              ) : (
                                <Text size="xs" c="dimmed" fs="italic">no tag</Text>
                              )}
                              <Badge size="xs" variant="outline" radius="sm" color="gray">{tg.items.length}</Badge>
                              <Box style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)', opacity: 0.5 }} />
                            </Group>
                          )}
                          {view === 'list' ? (
                            <Stack gap="xs">
                              {tg.items.map((p) => (
                                <ProjectListCard key={p.slug} project={p} isPinned={pinned.includes(p.slug)}
                                  onPin={() => togglePin(p.slug)} onEdit={() => openEditPage(p.slug)}
                                  onDelete={() => deleteProject(p.slug, p.name)}
                                  onToggleActive={() => confirmToggleActive(p.slug, p.name, p.isActive)}
                                  onTagClick={addTagFilter} onClick={() => openProject(p.slug)} />
                              ))}
                            </Stack>
                          ) : (
                            <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing={{ base: 'xs', sm: 'sm' }}>
                              {tg.items.map((p) => (
                                <ProjectGridCard key={p.slug} project={p} isPinned={pinned.includes(p.slug)}
                                  onPin={() => togglePin(p.slug)} onEdit={() => openEditPage(p.slug)}
                                  onDelete={() => deleteProject(p.slug, p.name)}
                                  onToggleActive={() => confirmToggleActive(p.slug, p.name, p.isActive)}
                                  onTagClick={addTagFilter} onClick={() => openProject(p.slug)} />
                              ))}
                            </SimpleGrid>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  )
                })()}
              </Box>
            ))}
          </Stack>
          {totalPages > 1 && (
            <Group justify="center" mt="lg">
              <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </>
      )}
    </Box>
  )
}
