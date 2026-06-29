import { Box, Button, Text, ThemeIcon } from '@mantine/core'
import { TbAlertTriangle } from 'react-icons/tb'

interface Props {
  error: unknown
  refetch: () => void
}

export function ProjectsErrorState({ error, refetch }: Props) {
  return (
    <Box p="xl" ta="center" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid color-mix(in srgb, var(--mantine-color-red-5) 35%, transparent)' }}>
      <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
        <TbAlertTriangle size={24} />
      </ThemeIcon>
      <Text fw={600} mb={4}>Gagal memuat project</Text>
      <Text size="sm" c="dimmed" mb="md">{(error as Error)?.message ?? 'Terjadi kesalahan saat memuat daftar project.'}</Text>
      <Button size="xs" variant="light" color="red" onClick={() => refetch()}>Coba lagi</Button>
    </Box>
  )
}
