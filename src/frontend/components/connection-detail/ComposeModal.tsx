import { Alert, Badge, Box, Button, Group, Loader, Modal, Stack, Text, ThemeIcon } from '@mantine/core'
import { TbAlertTriangle, TbCheck, TbFileCode, TbPencil } from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import type { StackInfo } from '@/frontend/types/portainer'

interface Props {
  opened: boolean
  onClose: () => void
  composeStack: StackInfo | null
  composeContent: string
  setComposeContent: (v: string) => void
  composeEditing: boolean
  setComposeEditing: (v: boolean) => void
  composeFetching: boolean
  composeData: any
  canMutate: boolean
  saveCompose: { isPending: boolean; mutate: () => void }
  onConfirmSave: () => void
}

export function ComposeModal({ opened, onClose, composeStack, composeContent, setComposeContent, composeEditing, setComposeEditing, composeFetching, composeData, canMutate, saveCompose, onConfirmSave }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={() => { onClose(); setComposeEditing(false) }}
      title={
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue" radius="md">
            <TbFileCode size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Compose — {composeStack?.name}</Text>
          {composeEditing && <Badge size="xs" color="orange" variant="light">editing</Badge>}
        </Group>
      }
      size="xl"
    >
      <Stack gap="sm">
        {composeFetching && !composeContent ? (
          <Group justify="center" py="xl"><Loader size="sm" /></Group>
        ) : (
          <>
            <Group justify="space-between">
              <Group gap="xs">
                <Badge size="xs" variant="outline" color="gray">docker-compose.yml</Badge>
                <Text fz={10} c="dimmed">{composeContent.split('\n').length} baris</Text>
              </Group>
              <Group gap="xs">
                {!composeEditing ? (
                  canMutate && (
                    <Button size="xs" variant="light" color="blue" leftSection={<TbPencil size={13} />} onClick={() => setComposeEditing(true)}>
                      Edit
                    </Button>
                  )
                ) : (
                  <>
                    <Button size="xs" variant="subtle" color="gray" onClick={() => { setComposeEditing(false); setComposeContent(composeData?.content ?? '') }}>
                      Batal
                    </Button>
                    <Button size="xs" color="blue" leftSection={<TbCheck size={13} />} loading={saveCompose.isPending} onClick={onConfirmSave}>
                      Simpan
                    </Button>
                  </>
                )}
              </Group>
            </Group>
            <Box style={{ borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }}>
              <CodeEditor value={composeContent} onChange={setComposeContent} language="yaml" filename="compose.yml" readOnly={!composeEditing} height={480} />
            </Box>
            {composeEditing && (
              <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
                <Text size="xs">
                  Perubahan langsung ke Portainer. Gunakan <strong>Recreate</strong> atau <strong>Repull</strong> setelah save untuk menerapkan ke container.
                </Text>
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}
