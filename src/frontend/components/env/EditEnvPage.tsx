import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import type { UseMutationResult } from '@tanstack/react-query'
import { TbAlertTriangle, TbCheck, TbChevronLeft, TbChevronRight } from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'

interface Props {
  env: string
  slug: string
  secretCount: number
  editEnvText: string
  setEditEnvText: (v: string) => void
  parsedEditEnv: { key: string; value: string }[]
  closeEditEnv: () => void
  editEnvSave: UseMutationResult<any, any, void>
  isMobile: boolean | undefined
}

export function EditEnvPage({
  env,
  slug,
  secretCount,
  editEnvText,
  setEditEnvText,
  parsedEditEnv,
  closeEditEnv,
  editEnvSave,
  isMobile: _isMobile,
}: Props) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={closeEditEnv}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={closeEditEnv}>
            {env}
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>
            Edit .env
          </Text>
          <Badge size="xs" variant="outline" color="gray">
            {slug}:{env}
          </Badge>
        </Group>
        <Divider />

        <Stack gap="sm">
          {secretCount > 0 && (
            <Alert
              color="orange"
              icon={<TbAlertTriangle size={14} />}
              py="xs"
              title="Secret vars disembunyikan"
              styles={{ title: { fontSize: 12 } }}
            >
              <Text size="xs">
                <strong>{secretCount} secret var</strong> tidak ditampilkan — akan tetap dipertahankan.
              </Text>
            </Alert>
          )}
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Konten .env
            </Text>
            <Text size="xs" c="dimmed">
              Format KEY=value per baris. Komentar (#) diabaikan.
            </Text>
            <CodeEditor
              value={editEnvText}
              onChange={setEditEnvText}
              language="ini"
              filename=".env"
              height={400}
              noMinimap
            />
          </Stack>
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            {parsedEditEnv.length > 0 ? (
              <Badge variant="light" color="blue" leftSection={<TbCheck size={11} />}>
                {parsedEditEnv.length} variabel
              </Badge>
            ) : (
              <Text size="xs" c="dimmed">
                Belum ada variabel valid
              </Text>
            )}
            {secretCount > 0 && (
              <Text size="xs" c="dimmed">
                {secretCount} secret dipertahankan
              </Text>
            )}
          </Group>
          <Group justify="flex-end">
            <Button
              onClick={() => editEnvSave.mutate()}
              loading={editEnvSave.isPending}
              disabled={parsedEditEnv.length === 0}
              leftSection={<TbCheck size={14} />}
            >
              {parsedEditEnv.length > 0 ? `Simpan ${parsedEditEnv.length} variabel` : 'Simpan'}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Paper>
  )
}
