import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { TbAlertTriangle, TbCheck, TbCloudUpload, TbPlug } from 'react-icons/tb'
import type { DiffItem, DiffResult, PortainerConfig } from './types'
import { apiFetch } from './types'

interface Props {
  opened: boolean
  onClose: () => void
  slug: string
  env: string
  config: PortainerConfig | null
  onConfirmSync: () => void
}

export function PortainerDiffModal({ opened, onClose, slug, env, config, onConfirmSync }: Props) {
  const { data: diffData, isFetching: diffFetching } = useQuery({
    queryKey: ['portainer', 'diff', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/portainer/sync-preview`, { method: 'POST' }),
    enabled: opened && !!config,
  })

  const diff: DiffResult | undefined = diffData?.diff

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue" radius="md"><TbPlug size={13} /></ThemeIcon>
          <Text fw={600} size="sm">Diff — {slug}:{env} vs Portainer</Text>
        </Group>
      }
      size="lg"
    >
      {diffFetching ? (
        <Group justify="center" py="xl"><Loader size="sm" /></Group>
      ) : diff ? (
        <Stack gap="md">
          <Group gap="xs">
            {diff.added.length > 0 && <Badge color="teal" variant="light">+{diff.added.length} baru</Badge>}
            {diff.removed.length > 0 && <Badge color="red" variant="light">-{diff.removed.length} dihapus</Badge>}
            {diff.changed.length > 0 && <Badge color="yellow" variant="light">~{diff.changed.length} berubah</Badge>}
            {diff.unchanged.length > 0 && <Badge color="gray" variant="light">{diff.unchanged.length} sama</Badge>}
          </Group>

          {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
            <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
              <Text size="xs">Semua vars sudah sinkron. Tidak perlu sync.</Text>
            </Alert>
          )}

          <ScrollArea.Autosize mah={400}>
            <Stack gap="xs">
              {diff.added.map((key: string) => (
                <Box key={key} p="xs" style={{ borderRadius: 'var(--mantine-radius-sm)', background: 'var(--mantine-color-teal-light)', borderLeft: '3px solid var(--mantine-color-teal-5)' }}>
                  <Group gap="xs">
                    <Badge size="xs" color="teal">+</Badge>
                    <Code fz="xs" fw={600}>{key}</Code>
                    <Text fz="xs" c="dimmed">akan ditambahkan</Text>
                  </Group>
                </Box>
              ))}
              {diff.removed.map((key: string) => (
                <Box key={key} p="xs" style={{ borderRadius: 'var(--mantine-radius-sm)', background: 'var(--mantine-color-red-light)', borderLeft: '3px solid var(--mantine-color-red-5)' }}>
                  <Group gap="xs">
                    <Badge size="xs" color="red">-</Badge>
                    <Code fz="xs" fw={600}>{key}</Code>
                    <Text fz="xs" c="dimmed">ada di Portainer, tidak di envman</Text>
                  </Group>
                </Box>
              ))}
              {diff.changed.map((item: DiffItem) => (
                <Box key={item.key} p="xs" style={{ borderRadius: 'var(--mantine-radius-sm)', background: 'var(--mantine-color-yellow-light)', borderLeft: '3px solid var(--mantine-color-yellow-5)' }}>
                  <Group gap="xs" mb={4}>
                    <Badge size="xs" color="yellow">~</Badge>
                    <Code fz="xs" fw={600}>{item.key}</Code>
                  </Group>
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text fz={10} c="dimmed" w={40}>lama</Text>
                      <Code fz={10} c="red.5">{item.oldValue || '(kosong)'}</Code>
                    </Group>
                    <Group gap="xs">
                      <Text fz={10} c="dimmed" w={40}>baru</Text>
                      <Code fz={10} c="teal.5">{item.newValue || '(kosong)'}</Code>
                    </Group>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </ScrollArea.Autosize>

          {(diff.added.length > 0 || diff.changed.length > 0) && (
            <Button color="primary" leftSection={<TbCloudUpload size={14} />} onClick={() => { onClose(); onConfirmSync() }}>
              Lanjut Sync
            </Button>
          )}
        </Stack>
      ) : (
        <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
          <Text size="xs">{diffData?.error ?? 'Gagal mengambil diff'}</Text>
        </Alert>
      )}
    </Modal>
  )
}
