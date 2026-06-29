import { Alert, Box, Button, Code, Group, Kbd, Text } from '@mantine/core'
import { TbFolders, TbPlus } from 'react-icons/tb'
import type { Project } from '@/frontend/hooks/useProjectList'

interface Props {
  projects: Project[]
  ownerCount: number
  totalEnvs: number
  isLoading: boolean
  isError: boolean
  canCreateProject: boolean
  openCreatePage: () => void
}

export function ProjectsHeader({ projects, ownerCount, totalEnvs, isLoading, isError, canCreateProject, openCreatePage }: Props) {
  return (
    <>
      <Group justify="space-between" mb="md" gap="xs" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fw={800} size="xl" lh={1.2}>Projects</Text>
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
    </>
  )
}
