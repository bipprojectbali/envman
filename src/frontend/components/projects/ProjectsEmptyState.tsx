import { Box, Button, Code, Text, ThemeIcon } from '@mantine/core'
import { TbFolders, TbPlus, TbSearch, TbX } from 'react-icons/tb'
import type { Project } from '@/frontend/hooks/useProjectList'

interface Props {
  projects: Project[]
  filtered: Project[]
  canCreateProject: boolean
  openCreatePage: () => void
  resetFilter: () => void
}

export function ProjectsEmptyState({ projects, filtered, canCreateProject, openCreatePage, resetFilter }: Props) {
  if (projects.length === 0) {
    return (
      <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
        <ThemeIcon size={56} radius="xl" variant="light" color="primary" mx="auto" mb="md">
          <TbFolders size={28} />
        </ThemeIcon>
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
    )
  }

  if (filtered.length === 0) {
    return (
      <Box p="xl" ta="center" style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
        <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
          <TbSearch size={24} />
        </ThemeIcon>
        <Text fw={600} mb={4}>Tidak ada hasil</Text>
        <Text size="sm" c="dimmed" mb="md">Tidak ada project yang cocok dengan filter saat ini.</Text>
        <Button size="xs" variant="subtle" leftSection={<TbX size={12} />} onClick={resetFilter}>Reset filter</Button>
      </Box>
    )
  }

  return null
}
