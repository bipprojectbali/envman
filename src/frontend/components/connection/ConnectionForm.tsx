import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import type { UseMutationResult } from '@tanstack/react-query'
import { TbAlertTriangle, TbCheck, TbChevronLeft, TbPlus, TbPlugConnected, TbX } from 'react-icons/tb'
import type { Connection } from '@/frontend/components/connection/ConnectionCard'

interface ConnectionFormProps {
  form: { name: string; portainerUrl: string; apiToken: string }
  setForm: React.Dispatch<React.SetStateAction<{ name: string; portainerUrl: string; apiToken: string }>>
  editTarget: Connection | null
  testResult: { ok: boolean; message: string } | null
  setTestResult: (r: { ok: boolean; message: string } | null) => void
  testConnection: UseMutationResult<any, Error, void>
  saveConnection: UseMutationResult<any, Error, void>
  handleClose: () => void
}

export function ConnectionForm({
  form,
  setForm,
  editTarget,
  testResult,
  setTestResult,
  testConnection,
  saveConnection,
  handleClose,
}: ConnectionFormProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleClose}>
            <TbChevronLeft size={15} />
          </ActionIcon>
          <Anchor component="span" size="sm" c="dimmed" style={{ cursor: 'pointer' }} onClick={handleClose}>
            Connections
          </Anchor>
          <Text size="sm" c="dimmed">
            /
          </Text>
          <Text size="sm" fw={600}>
            {editTarget ? `Edit: ${editTarget.name}` : 'Tambah Connection'}
          </Text>
        </Group>
        <Divider />
        <TextInput
          label="Nama"
          placeholder="Production Portainer, Dev Server, ..."
          description="Nama untuk identifikasi — akan muncul di setiap environment setup"
          value={form.name}
          autoFocus
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <TextInput
          label="Portainer URL"
          placeholder="https://portainer.example.com"
          description="URL lengkap dengan protokol (https://) tanpa path"
          value={form.portainerUrl}
          onChange={(e) => setForm((f) => ({ ...f, portainerUrl: e.target.value.trim() }))}
          error={
            form.portainerUrl && !/^https?:\/\//.test(form.portainerUrl)
              ? 'URL harus diawali http:// atau https://'
              : undefined
          }
        />
        <PasswordInput
          label="API Token"
          placeholder={editTarget ? '— kosongkan untuk pakai token lama —' : 'ptr_xxxxxxxxxxxx'}
          description={
            editTarget && !form.apiToken
              ? 'Token tersimpan tetap digunakan jika dikosongkan'
              : 'Buat di Portainer: Account → Access tokens → Add access token'
          }
          value={form.apiToken}
          onChange={(e) => setForm((f) => ({ ...f, apiToken: e.target.value }))}
        />
        {testResult && (
          <Alert
            color={testResult.ok ? 'teal' : 'red'}
            icon={testResult.ok ? <TbCheck size={14} /> : <TbAlertTriangle size={14} />}
            p="xs"
            withCloseButton
            onClose={() => setTestResult(null)}
          >
            <Text size="xs">{testResult.message}</Text>
          </Alert>
        )}
        <Group justify="space-between" gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<TbPlugConnected size={13} />}
            loading={testConnection.isPending}
            disabled={!form.portainerUrl || (!form.apiToken && !editTarget)}
            onClick={() => testConnection.mutate()}
          >
            Test Connection
          </Button>
          <Text size="xs" c="dimmed">
            {form.apiToken || editTarget ? '' : 'Test perlu URL + token'}
          </Text>
        </Group>
        <Divider />
        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={handleClose}>
            Batal
          </Button>
          <Button
            leftSection={editTarget ? <TbCheck size={14} /> : <TbPlus size={14} />}
            color="primary"
            loading={saveConnection.isPending}
            disabled={!form.name || !form.portainerUrl || (!editTarget && !form.apiToken)}
            onClick={() => saveConnection.mutate()}
          >
            {editTarget ? 'Update' : 'Simpan Connection'}
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
