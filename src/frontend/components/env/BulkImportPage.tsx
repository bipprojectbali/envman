import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core'
import type { UseMutationResult } from '@tanstack/react-query'
import { TbAlertTriangle, TbCheck, TbChevronLeft, TbChevronRight, TbFileImport } from 'react-icons/tb'

interface Props {
  env: string
  bulkText: string
  setBulkText: (v: string) => void
  bulkAllSecret: boolean
  setBulkAllSecret: (v: boolean) => void
  parsedBulk: { key: string; value: string }[]
  bulkImport: UseMutationResult<any, any, void>
  closeBulk: () => void
  isMobile: boolean | undefined
}

export function BulkImportPage({
  env,
  bulkText,
  setBulkText,
  bulkAllSecret,
  setBulkAllSecret,
  parsedBulk,
  bulkImport,
  closeBulk,
  isMobile,
}: Props) {
  const handleClose = () => {
    closeBulk()
    setBulkText('')
    setBulkAllSecret(false)
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="lg">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleClose}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={handleClose}>
            {env}
          </Anchor>
          <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
          <Text size="sm" fw={600}>
            Paste .env
          </Text>
        </Group>
        <Divider />

        <Stack gap="sm">
          <Textarea
            label="Konten .env"
            description="Komentar (#) dan baris kosong diabaikan."
            placeholder={'DATABASE_URL=postgres://...\nREDIS_URL=redis://...\nAPI_KEY="nilai dengan spasi"'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            autoFocus
            autosize
            minRows={isMobile ? 4 : 6}
            maxRows={isMobile ? 10 : 16}
            styles={{
              input: {
                fontFamily: 'monospace',
                fontSize: isMobile ? 13 : 12,
              },
            }}
          />
          {parsedBulk.length > 0 && (
            <>
              <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                <Badge variant="light" color="blue" leftSection={<TbCheck size={11} />}>
                  {parsedBulk.length} variabel terdeteksi
                </Badge>
                <Checkbox
                  size="xs"
                  label="Semua sebagai secret"
                  checked={bulkAllSecret}
                  onChange={(e) => setBulkAllSecret(e.currentTarget.checked)}
                />
              </Group>
              <Box
                style={{
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '1px solid var(--mantine-color-default-border)',
                  overflow: 'hidden',
                }}
              >
                <ScrollArea.Autosize mah={isMobile ? 160 : 200}>
                  <Table fz="xs" horizontalSpacing="xs" verticalSpacing={4} highlightOnHover>
                    <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                      <Table.Tr>
                        <Table.Th>Key</Table.Th>
                        <Table.Th>Value</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {parsedBulk.map(({ key, value }) => (
                        <Table.Tr key={key}>
                          <Table.Td>
                            <Code fz="xs" fw={600}>
                              {key}
                            </Code>
                          </Table.Td>
                          <Table.Td>
                            <Text
                              fz="xs"
                              ff="monospace"
                              c={!value ? 'dimmed' : undefined}
                              fs={!value ? 'italic' : undefined}
                            >
                              {bulkAllSecret ? '••••••••' : value || '(kosong)'}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              </Box>
            </>
          )}
          {bulkText.trim() && parsedBulk.length === 0 && (
            <Alert color="orange" icon={<TbAlertTriangle size={14} />} p="xs">
              <Text size="xs">
                Tidak ada <Code fz="xs">KEY=value</Code> yang valid.
              </Text>
            </Alert>
          )}
          <Group justify="end">
            <Button
              onClick={() => bulkImport.mutate()}
              loading={bulkImport.isPending}
              disabled={parsedBulk.length === 0}
              leftSection={<TbFileImport size={14} />}
            >
              {parsedBulk.length > 0 ? `Import ${parsedBulk.length} variabel` : 'Import'}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Paper>
  )
}
