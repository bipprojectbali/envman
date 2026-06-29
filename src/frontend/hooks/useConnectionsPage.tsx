import { Group, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TbTrash } from 'react-icons/tb'
import { type Connection, DeleteConnectionConfirm } from '@/frontend/components/connection/ConnectionCard'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

type TestResult = { ok: boolean; message: string }

interface Props {
  connections: Connection[]
  editTarget: Connection | null
  connectionFormId: string | undefined
  handleClose: () => void
}

export function useConnectionsPage({ connections, editTarget, connectionFormId, handleClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', portainerUrl: '', apiToken: '' })
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useLocalStorage<'grid' | 'list'>({ key: 'envman:connections:view', defaultValue: 'grid' })
  const [debouncedSearch] = useDebouncedValue(search, 120)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (connectionFormId === 'new') {
      setForm({ name: '', portainerUrl: '', apiToken: '' })
      setTestResult(null)
    } else if (editTarget) {
      setForm({ name: editTarget.name, portainerUrl: editTarget.portainerUrl, apiToken: '' })
      setTestResult(null)
    }
  }, [connectionFormId, editTarget?.id, editTarget?.portainerUrl, editTarget?.name, editTarget])

  const healthQueries = useQueries({
    queries: connections.map((c) => ({
      queryKey: ['portainer', 'connection-health', c.id],
      queryFn: () => apiFetch(`/api/envman/portainer/connections/${c.id}/health`),
      staleTime: 60_000,
      retry: false,
    })),
  })
  const healthMap = Object.fromEntries(
    connections.map((c, i) => [
      c.id,
      healthQueries[i]?.data as { totalStacks: number; activeStacks: number; inactiveStacks: number } | undefined,
    ]),
  )

  const filteredConnections = useMemo(() => {
    if (!debouncedSearch.trim()) return connections
    const q = debouncedSearch.toLowerCase()
    return connections.filter((c) => c.name.toLowerCase().includes(q) || c.portainerUrl.toLowerCase().includes(q))
  }, [connections, debouncedSearch])

  const testConnection = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { portainerUrl: form.portainerUrl }
      if (form.apiToken) body.apiToken = form.apiToken
      else if (editTarget) { body.slug = '_test_'; body.envName = '_test_' }
      return apiFetch('/api/envman/portainer/probe', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: (data) => setTestResult({ ok: true, message: `Connected — ${data.stacks.length} stack(s) ditemukan` }),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  })

  const saveConnection = useMutation({
    mutationFn: () => {
      if (editTarget) {
        return apiFetch(`/api/envman/portainer/connections/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, portainerUrl: form.portainerUrl, ...(form.apiToken ? { apiToken: form.apiToken } : {}) }),
        })
      }
      return apiFetch('/api/envman/portainer/connections', { method: 'POST', body: JSON.stringify(form) })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portainer', 'connections'] })
      notifyOk(editTarget ? 'Connection diperbarui' : 'Connection berhasil ditambahkan')
      handleClose()
    },
    onError: (e) => notifyErr(e),
  })

  const deleteConnection = (id: string, name: string, usedBy: number) => {
    const modalId = `delete-conn-${id}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus connection</Text>
        </Group>
      ),
      children: (
        <DeleteConnectionConfirm
          name={name}
          usedBy={usedBy}
          onCancel={() => modals.close(modalId)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/portainer/connections/${id}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['portainer', 'connections'] })
              notifyOk(`Connection "${name}" dihapus`)
              modals.close(modalId)
            } catch (e) { notifyErr(e) }
          }}
        />
      ),
    })
  }

  return { form, setForm, testResult, setTestResult, search, setSearch, view, setView, debouncedSearch, searchRef, healthMap, filteredConnections, testConnection, saveConnection, deleteConnection }
}
