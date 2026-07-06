import { Box, Skeleton } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { CreateProjectForm } from '@/frontend/components/projects/CreateProjectForm'
import { EditProjectForm } from '@/frontend/components/projects/EditProjectForm'
import { FormPageShell } from '@/frontend/components/projects/FormPageShell'
import { ProjectsEmptyState } from '@/frontend/components/projects/ProjectsEmptyState'
import { ProjectsErrorState } from '@/frontend/components/projects/ProjectsErrorState'
import { ProjectsGrid } from '@/frontend/components/projects/ProjectsGrid'
import { ProjectsHeader } from '@/frontend/components/projects/ProjectsHeader'
import { ProjectsLoadingSkeleton } from '@/frontend/components/projects/ProjectsLoadingSkeleton'
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
    creatorScope, setCreatorScope, allCreators, isSuperAdmin,
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
      <FormPageShell title="Buat Project Baru" onBack={closeFormPage}>
        <CreateProjectForm
          form={form} setForm={setForm} slugManual={slugManual} setSlugManual={setSlugManual}
          allTagValues={allTags.map((t) => t.value)} existingSlugs={projects.map((p) => p.slug)}
          isPending={createProject.isPending} onClose={closeFormPage}
          onSubmit={() => createProject.mutate(form)}
        />
      </FormPageShell>
    )
  }

  if (editSlug) {
    const editingProject = projects.find((p) => p.slug === editSlug)
    return (
      <FormPageShell title={editingProject ? `Edit: ${editingProject.name}` : '...'} onBack={closeFormPage}>
        {isLoading || !editingProject ? (
          <Skeleton height={400} radius="md" />
        ) : (
          <EditProjectForm
            key={editSlug} project={editingProject}
            allTagValues={allTags.map((t) => t.value)}
            isPending={editProject.isPending} onClose={closeFormPage}
            onSubmit={(data) => editProject.mutate(data)}
          />
        )}
      </FormPageShell>
    )
  }

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover effects */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      <ProjectsHeader
        projects={projects} ownerCount={ownerCount} totalEnvs={totalEnvs}
        isLoading={isLoading} isError={isError}
        canCreateProject={canCreateProject} openCreatePage={openCreatePage}
      />

      {!isLoading && !isError && projects.length > 0 && (
        <ProjectsToolbar
          search={search} setSearch={setSearch} searchRef={searchRef}
          view={view} setView={setView}
          allTags={allTags} tagFilter={tagFilter} setTagFilter={setTagFilter}
          sort={sort} setSort={setSort}
          groupByTag={groupByTag} setGroupByTag={setGroupByTag}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          creatorScope={creatorScope} setCreatorScope={setCreatorScope}
          allCreators={allCreators} isSuperAdmin={isSuperAdmin}
          filtered={filtered} projects={projects}
          hasFilter={hasFilter} resetFilter={resetFilter}
        />
      )}

      {isError && <ProjectsErrorState error={error} refetch={refetch} />}

      {isLoading && <ProjectsLoadingSkeleton view={view} />}

      {!isLoading && !isError && (
        <ProjectsEmptyState
          projects={projects} filtered={filtered}
          canCreateProject={canCreateProject}
          openCreatePage={openCreatePage} resetFilter={resetFilter}
        />
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
