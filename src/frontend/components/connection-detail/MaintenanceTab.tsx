import { ActionIcon, Alert, Badge, Box, Button, Code, Divider, Group, Paper, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { TbAlertTriangle, TbBox, TbCheck, TbDatabase, TbNetwork, TbPackage, TbRefresh, TbTrash } from 'react-icons/tb'
import { relTime, stateColor } from '@/frontend/types/portainer'

interface Props {
  endpointIds: number[]
  cleanupEndpointId: number | null
  setCleanupEndpointId: (id: number) => void
  imagesData: any
  imagesFetching: boolean
  refetchImages: () => void
  containersData: any
  containersFetching: boolean
  refetchContainers: () => void
  volumesData: any
  volumesFetching: boolean
  refetchVolumes: () => void
  networksData: any
  networksFetching: boolean
  refetchNetworks: () => void
  pruneImages: { isPending: boolean; data?: any; mutate: () => void }
  confirmPruneImages: () => void
  pruneContainers: { isPending: boolean; mutate: () => void }
  pruneVolumes: { isPending: boolean; mutate: () => void }
  pruneNetworks: { isPending: boolean; mutate: () => void }
  canPrune: boolean
}

const tableStyle = { borderRadius: 'var(--mantine-radius-sm)', border: '1px solid var(--mantine-color-default-border)', overflow: 'hidden' }
const theadStyle = { background: 'var(--mantine-color-default-hover)' }

export function MaintenanceTab({ endpointIds, cleanupEndpointId, setCleanupEndpointId, imagesData, imagesFetching, refetchImages, containersData, containersFetching, refetchContainers, volumesData, volumesFetching, refetchVolumes, networksData, networksFetching, refetchNetworks, pruneImages, confirmPruneImages, pruneContainers, pruneVolumes, pruneNetworks, canPrune }: Props) {
  return (
    <>
      <Divider mb="md" label={<Group gap="xs"><TbPackage size={13} /><Text size="xs" fw={500} c="dimmed">Docker Cleanup</Text></Group>} labelPosition="left" />

      <Paper p="md" style={{ borderRadius: 'var(--mantine-radius-md)' }}>
        {/* Endpoint selector */}
        {endpointIds.length > 1 && (
          <Group mb="md" gap="xs">
            <Text size="xs" c="dimmed" fw={500}>Endpoint:</Text>
            {endpointIds.map((epId) => (
              <Badge key={epId} size="sm" variant={cleanupEndpointId === epId ? 'filled' : 'outline'} color="gray" style={{ cursor: 'pointer' }} onClick={() => setCleanupEndpointId(epId)}>
                #{epId}
              </Badge>
            ))}
          </Group>
        )}
        {cleanupEndpointId !== null && (
          <Text size="xs" c="dimmed" mb="md">Endpoint <strong>#{cleanupEndpointId}</strong></Text>
        )}

        {/* ─── Dangling Images ─── */}
        <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Dangling Images</Text>
            <Text size="xs" c="dimmed">Images yang tidak dipakai container manapun di host ini</Text>
          </Box>
          <Group gap="xs">
            {imagesData && (
              <Badge size="sm" variant="light" color={imagesData.count > 0 ? 'orange' : 'teal'}>
                {imagesData.count} image — {imagesData.totalSizeMB} MB
              </Badge>
            )}
            {cleanupEndpointId === null && <Text size="xs" c="dimmed">Menunggu data stacks...</Text>}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={imagesFetching} onClick={() => refetchImages()}><TbRefresh size={13} /></ActionIcon>
            {imagesData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />} loading={pruneImages.isPending} onClick={confirmPruneImages}>
                Prune Images
              </Button>
            )}
          </Group>
        </Group>

        {imagesData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs">
            <Text size="xs">Tidak ada dangling images. Host Docker bersih!</Text>
          </Alert>
        ) : imagesData?.images?.length > 0 ? (
          <Box mb="md" style={tableStyle}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={theadStyle}><Table.Tr><Table.Th>ID</Table.Th><Table.Th>Tag</Table.Th><Table.Th>Size</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {imagesData.images.map((img: any) => (
                    <Table.Tr key={img.id}>
                      <Table.Td><Code fz={10}>{img.id}</Code></Table.Td>
                      <Table.Td>{img.tags.length > 0 ? <Code fz={10}>{img.tags[0]}</Code> : <Text fz="xs" c="dimmed">&lt;none&gt;</Text>}</Table.Td>
                      <Table.Td><Text fz="xs">{img.size < 1024 * 1024 ? `${Math.round(img.size / 1024)} KB` : `${Math.round(img.size / 1024 / 1024)} MB`}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}

        {/* Info jika ada stuck images setelah prune */}
        {pruneImages.data?.stuckByContainers > 0 && (
          <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs" mb="sm">
            <Text size="xs" fw={500} mb={2}>{pruneImages.data.stuckByContainers} image tidak bisa dihapus</Text>
            <Text size="xs" c="dimmed">
              Image masih direferensi oleh container yang stopped. Hapus container tersebut terlebih dahulu, lalu coba prune ulang.
            </Text>
            {pruneImages.data.stuckImages?.length > 0 && (
              <Group gap="xs" mt="xs" wrap="wrap">
                {pruneImages.data.stuckImages.map((img: any) => <Code key={img.id} fz={10}>{img.tags[0] ?? img.id}</Code>)}
              </Group>
            )}
          </Alert>
        )}

        {/* ─── Stopped Containers ─── */}
        <Divider mb="md" mt="md" label={<Group gap={6}><TbBox size={12} /><Text size="xs" fw={500} c="dimmed">Stopped Containers</Text></Group>} labelPosition="left" />
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Stopped / Dead Containers</Text>
            <Text size="xs" c="dimmed">Container yang sudah berhenti dan belum dihapus</Text>
          </Box>
          <Group gap="xs">
            {containersData && (
              <Badge size="sm" variant="light" color={containersData.count > 0 ? 'orange' : 'teal'}>
                {containersData.count} container{containersData.totalSizeMB > 0 ? ` — ${containersData.totalSizeMB} MB` : ''}
              </Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={containersFetching} onClick={() => refetchContainers()}><TbRefresh size={13} /></ActionIcon>
            {containersData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />} loading={pruneContainers.isPending}
                onClick={() => modals.openConfirmModal({
                  title: 'Hapus Stopped Containers',
                  children: (
                    <Stack gap="xs">
                      <Text size="sm">Hapus <strong>{containersData.count}</strong> stopped/dead container?</Text>
                      <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
                        <Text size="xs">Container yang dihapus tidak bisa dikembalikan. Image yang dipakai container ini mungkin bisa di-prune setelah ini.</Text>
                      </Alert>
                    </Stack>
                  ),
                  labels: { confirm: 'Hapus Containers', cancel: 'Batal' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => pruneContainers.mutate(),
                })}>
                Prune Containers
              </Button>
            )}
          </Group>
        </Group>
        {containersData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs" mb="md"><Text size="xs">Tidak ada stopped containers.</Text></Alert>
        ) : containersData?.containers?.length > 0 ? (
          <Box mb="md" style={tableStyle}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={theadStyle}><Table.Tr><Table.Th>ID</Table.Th><Table.Th>Nama</Table.Th><Table.Th>Image</Table.Th><Table.Th>Status</Table.Th><Table.Th>Size</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {containersData.containers.map((c: any) => (
                    <Table.Tr key={c.id}>
                      <Table.Td><Code fz={10}>{c.id}</Code></Table.Td>
                      <Table.Td><Text fz="xs">{c.name || '—'}</Text></Table.Td>
                      <Table.Td><Code fz={10}>{c.image}</Code></Table.Td>
                      <Table.Td><Badge size="xs" color={stateColor[c.state] ?? 'gray'} variant="light">{c.status}</Badge></Table.Td>
                      <Table.Td><Text fz="xs">{c.size > 0 ? (c.size < 1024 * 1024 ? `${Math.round(c.size / 1024)} KB` : `${Math.round(c.size / 1024 / 1024)} MB`) : '—'}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}

        {/* ─── Unused Volumes ─── */}
        <Divider mb="md" mt="xs" label={<Group gap={6}><TbDatabase size={12} /><Text size="xs" fw={500} c="dimmed">Unused Volumes</Text></Group>} labelPosition="left" />
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Unused Volumes</Text>
            <Text size="xs" c="dimmed">Volume yang tidak dipakai container manapun</Text>
          </Box>
          <Group gap="xs">
            {volumesData && (
              <Badge size="sm" variant="light" color={volumesData.count > 0 ? 'orange' : 'teal'}>{volumesData.count} volume</Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={volumesFetching} onClick={() => refetchVolumes()}><TbRefresh size={13} /></ActionIcon>
            {volumesData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="red" leftSection={<TbTrash size={13} />} loading={pruneVolumes.isPending}
                onClick={() => modals.openConfirmModal({
                  title: 'Hapus Unused Volumes',
                  children: (
                    <Stack gap="xs">
                      <Text size="sm">Hapus <strong>{volumesData.count}</strong> volume yang tidak dipakai?</Text>
                      <Alert color="red" icon={<TbAlertTriangle size={14} />} p="xs">
                        <Text size="xs" fw={600}>Data di volume yang dihapus tidak bisa dikembalikan.</Text>
                      </Alert>
                    </Stack>
                  ),
                  labels: { confirm: 'Hapus Volumes', cancel: 'Batal' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => pruneVolumes.mutate(),
                })}>
                Prune Volumes
              </Button>
            )}
          </Group>
        </Group>
        {volumesData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs" mb="md"><Text size="xs">Tidak ada unused volumes.</Text></Alert>
        ) : volumesData?.volumes?.length > 0 ? (
          <Box mb="md" style={tableStyle}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={theadStyle}><Table.Tr><Table.Th>Nama</Table.Th><Table.Th>Driver</Table.Th><Table.Th>Dibuat</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {volumesData.volumes.map((v: any) => (
                    <Table.Tr key={v.name}>
                      <Table.Td><Code fz={10}>{v.name}</Code></Table.Td>
                      <Table.Td><Text fz="xs">{v.driver}</Text></Table.Td>
                      <Table.Td><Text fz="xs">{relTime(v.createdAt)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}

        {/* ─── Unused Networks ─── */}
        <Divider mb="md" mt="xs" label={<Group gap={6}><TbNetwork size={12} /><Text size="xs" fw={500} c="dimmed">Unused Networks</Text></Group>} labelPosition="left" />
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Box>
            <Text fw={600} size="sm" mb={2}>Dangling Networks</Text>
            <Text size="xs" c="dimmed">Network Docker yang tidak dipakai container manapun</Text>
          </Box>
          <Group gap="xs">
            {networksData && (
              <Badge size="sm" variant="light" color={networksData.count > 0 ? 'orange' : 'teal'}>{networksData.count} network</Badge>
            )}
            <ActionIcon size="sm" variant="subtle" color="gray" loading={networksFetching} onClick={() => refetchNetworks()}><TbRefresh size={13} /></ActionIcon>
            {networksData?.count > 0 && canPrune && (
              <Button size="xs" variant="light" color="orange" leftSection={<TbTrash size={13} />} loading={pruneNetworks.isPending}
                onClick={() => modals.openConfirmModal({
                  title: 'Hapus Unused Networks',
                  children: <Text size="sm">Hapus <strong>{networksData.count}</strong> network Docker yang tidak dipakai?</Text>,
                  labels: { confirm: 'Hapus Networks', cancel: 'Batal' },
                  confirmProps: { color: 'orange' },
                  onConfirm: () => pruneNetworks.mutate(),
                })}>
                Prune Networks
              </Button>
            )}
          </Group>
        </Group>
        {networksData?.count === 0 ? (
          <Alert color="teal" icon={<TbCheck size={14} />} p="xs" mb="md"><Text size="xs">Tidak ada dangling networks.</Text></Alert>
        ) : networksData?.networks?.length > 0 ? (
          <Box mb="md" style={tableStyle}>
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" horizontalSpacing="sm" verticalSpacing={4} highlightOnHover>
                <Table.Thead style={theadStyle}><Table.Tr><Table.Th>ID</Table.Th><Table.Th>Nama</Table.Th><Table.Th>Driver</Table.Th><Table.Th>Scope</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {networksData.networks.map((n: any) => (
                    <Table.Tr key={n.id}>
                      <Table.Td><Code fz={10}>{n.id}</Code></Table.Td>
                      <Table.Td><Text fz="xs">{n.name}</Text></Table.Td>
                      <Table.Td><Text fz="xs">{n.driver}</Text></Table.Td>
                      <Table.Td><Text fz="xs">{n.scope}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Box>
        ) : null}
      </Paper>
    </>
  )
}
