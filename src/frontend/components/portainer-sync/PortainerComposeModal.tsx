import { Box, Button, Code, Group, Modal, Skeleton, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbCheck, TbCode } from 'react-icons/tb'
import { CodeEditor } from '@/frontend/components/CodeEditor'
import type { PortainerConfig } from './types'
import { apiFetch } from './types'

interface Props {
  opened: boolean
  onClose: () => void
  config: PortainerConfig | null
}

export function PortainerComposeModal({ opened, onClose, config }: Props) {
  const [composeContent, setComposeContent] = useState('')

  const composeQuery = useQuery({
    queryKey: ['portainer', 'compose', config?.connectionId, config?.stackId],
    queryFn: () => apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/file`),
    enabled: opened && !!config?.connectionId && !!config?.stackId,
    staleTime: 0,
  })

  useEffect(() => {
    if (composeQuery.data?.content !== undefined) setComposeContent(composeQuery.data.content)
  }, [composeQuery.data])

  const saveCompose = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/api/envman/portainer/connections/${config!.connectionId}/stacks/${config!.stackId}/file`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => onClose(),
    onError: (e: Error) => alert(e.message),
  })

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" color="violet" radius="md"><TbCode size={15} /></ThemeIcon>
          <Box>
            <Text fw={700} size="sm">Edit Compose File</Text>
            <Code fz="xs">{config?.stackName}</Code>
          </Box>
        </Group>
      }
      size="xl"
      centered
    >
      {composeQuery.isLoading ? (
        <Skeleton height={400} />
      ) : (
        <CodeEditor
          value={composeContent}
          onChange={(v) => setComposeContent(v ?? '')}
          filename="docker-compose.yml"
          height={450}
          noMinimap
        />
      )}
      <Group justify="flex-end" gap="xs" mt="md">
        <Button variant="subtle" color="gray" onClick={onClose} disabled={saveCompose.isPending}>Batal</Button>
        <Button
          color="violet"
          leftSection={<TbCheck size={14} />}
          loading={saveCompose.isPending}
          disabled={composeQuery.isLoading || !composeContent}
          onClick={() => {
            modals.openConfirmModal({
              title: 'Apply & Redeploy?',
              children: (
                <Text size="sm">Stack <strong>{config?.stackName}</strong> akan di-redeploy dengan compose file baru.</Text>
              ),
              labels: { confirm: 'Apply & Redeploy', cancel: 'Batal' },
              confirmProps: { color: 'violet' },
              onConfirm: () => saveCompose.mutate(composeContent),
            })
          }}
        >
          Apply & Redeploy
        </Button>
      </Group>
    </Modal>
  )
}
