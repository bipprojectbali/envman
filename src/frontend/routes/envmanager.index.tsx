import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Kbd,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbChevronLeft,
  TbChevronRight,
  TbFolders,
  TbPlus,
  TbSearch,
  TbX,
} from 'react-icons/tb'
import { CreateProjectForm } from '@/frontend/components/projects/CreateProjectForm'
import { EditProjectForm } from '@/frontend/components/projects/EditProjectForm'
import { ProjectsGrid } from '@/frontend/components/projects/ProjectsGrid'
import { ProjectsToolbar } from '@/frontend/components/projects/ProjectsToolbar'
import { useProjectList } from '@/frontend/hooks/useProjectList'
import { useProjectModals } from '@/frontend/hooks/useProjectModals'

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

  const { confirmToggleActive, deleteProject } = useProjectModals({ toggleActive, setPinned })

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
        <ProjectsToolbar
          search={search} setSearch={setSearch} searchRef={searchRef}
          view={view} setView={setView}
          allTags={allTags} tagFilter={tagFilter} setTagFilter={setTagFilter}
          sort={sort} setSort={setSort}
          groupByTag={groupByTag} setGroupByTag={setGroupByTag}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          filtered={filtered} projects={projects}
          hasFilter={hasFilter} resetFilter={resetFilter}
        />
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
        <ProjectsGrid
          paginatedGroups={paginatedGroups} view={view} pinned={pinned} groupByTag={groupByTag}
          togglePin={togglePin} openEditPage={openEditPage}
          deleteProject={deleteProject} confirmToggleActive={confirmToggleActive}
          addTagFilter={addTagFilter} openProject={openProject}
          page={page} setPage={setPage} totalPages={totalPages}
        />
      )}
    </Box>
  )
}
