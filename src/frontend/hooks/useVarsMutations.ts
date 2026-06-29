import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createElement } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { toEnvText } from '@/frontend/lib/env-clipboard'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { EnvVar } from '@/frontend/types/env'

interface UseVarsMutationsInput {
  slug: string
  env: string
  vars: EnvVar[]
  revealed: Set<string>
  bulkText: string
  editEnvText: string
  bulkAllSecret: boolean
  plainCount: number
  secretCount: number
  setBulkText: (v: string) => void
  setBulkAllSecret: (v: boolean) => void
  closeAdd: () => void
  closeBulk: () => void
  closeEditEnv: () => void
  openEditEnv: () => void
  setEditEnvText: (v: string) => void
  setEditingId: (id: string | null) => void
}

export function useVarsMutations({
  slug, env, vars, revealed,
  bulkText, editEnvText, bulkAllSecret,
  plainCount, secretCount,
  setBulkText, setBulkAllSecret,
  closeAdd, closeBulk, closeEditEnv, openEditEnv, setEditEnvText, setEditingId,
}: UseVarsMutationsInput) {
  const qc = useQueryClient()
  const varQueryKey = ['envman', 'vars', slug, env]

  const parsedBulk = useMemo(() => {
    const result: { key: string; value: string }[] = []
    for (const raw of bulkText.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const key = line.slice(0, eq).trim(); if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      result.push({ key, value })
    }
    return result
  }, [bulkText])

  const parsedEditEnv = useMemo(() => {
    const result: { key: string; value: string }[] = []
    for (const raw of editEnvText.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const key = line.slice(0, eq).trim(); if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      result.push({ key, value })
    }
    return result
  }, [editEnvText])

  const addVar = useMutation({
    mutationFn: (body: { key: string; value: string; isSecret: boolean }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: varQueryKey }); closeAdd(); notifyOk('Variabel ditambahkan') },
    onError: (e) => notifyErr(e),
  })

  const deleteVar = (key: string) =>
    modals.openConfirmModal({
      title: 'Hapus variabel',
      children: createElement('span', { style: { fontSize: '0.875rem' } }, 'Hapus ', createElement('code', null, key), '?'),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars/${key}`, { method: 'DELETE' })
          .then(() => { qc.invalidateQueries({ queryKey: varQueryKey }); notifyOk(`${key} dihapus`) })
          .catch(notifyErr),
    })

  const updateVar = useMutation({
    mutationFn: ({ key, value, isSecret }: { key: string; value: string; isSecret: boolean }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify({ key, value, isSecret }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: varQueryKey }); setEditingId(null); notifyOk('Variabel diperbarui') },
    onError: (e) => notifyErr(e),
  })

  const toggleDisabled = useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ isDisabled: boolean }>(`/api/envman/projects/${slug}/environments/${env}/vars/${key}/toggle`, { method: 'PATCH' }),
    onMutate: async (key) => {
      await qc.cancelQueries({ queryKey: varQueryKey })
      const previous = qc.getQueryData(varQueryKey)
      qc.setQueryData(varQueryKey, (old: any) => ({
        ...old, vars: old?.vars?.map((v: any) => (v.key === key ? { ...v, isDisabled: !v.isDisabled } : v)) ?? [],
      }))
      return { previous }
    },
    onError: (e, _key, context) => { if (context?.previous) qc.setQueryData(varQueryKey, context.previous); notifyErr(e) },
    onSuccess: (data) => notifyOk(data.isDisabled ? 'Variabel dinonaktifkan' : 'Variabel diaktifkan'),
    onSettled: () => qc.invalidateQueries({ queryKey: varQueryKey }),
  })

  const clearAll = useMutation({
    mutationFn: () =>
      Promise.all(vars.map((v) => apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars/${v.key}`, { method: 'DELETE' }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: varQueryKey }); notifyOk('Semua variabel dihapus') },
    onError: (e) => notifyErr(e),
  })

  const bulkToggleType = useMutation({
    mutationFn: (targetSecret: boolean) =>
      Promise.all(vars.filter((v) => v.isSecret !== targetSecret && v.value !== '***').map((v) =>
        apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, { method: 'POST', body: JSON.stringify({ key: v.key, value: v.value, isSecret: targetSecret }) }),
      )),
    onSuccess: (_: unknown, targetSecret: boolean) => {
      qc.invalidateQueries({ queryKey: varQueryKey })
      notifyOk(targetSecret ? 'Semua variabel ditandai secret' : 'Semua variabel ditandai plain')
    },
    onError: (e) => notifyErr(e),
  })

  const bulkImport = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
        method: 'PUT',
        body: JSON.stringify({ vars: Object.fromEntries(parsedBulk.map(({ key, value }) => [key, value])), secrets: bulkAllSecret ? parsedBulk.map(({ key }) => key) : [] }),
      }),
    onSuccess: (data: { count: number }) => {
      qc.invalidateQueries({ queryKey: varQueryKey }); closeBulk(); setBulkText(''); setBulkAllSecret(false)
      notifyOk(`${data.count} variabel berhasil diimpor`)
    },
    onError: (e) => notifyErr(e),
  })

  const editEnvSave = useMutation({
    mutationFn: () => {
      const secretKeys = vars.filter((v) => v.isSecret).map((v) => v.key)
      return apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
        method: 'PUT',
        body: JSON.stringify({ vars: Object.fromEntries(parsedEditEnv.map(({ key, value }) => [key, value])), secrets: secretKeys.filter((k) => parsedEditEnv.some((p) => p.key === k)) }),
      })
    },
    onSuccess: (data: { count: number }) => {
      qc.invalidateQueries({ queryKey: varQueryKey }); closeEditEnv(); notifyOk(`${data.count} variabel disimpan`)
    },
    onError: (e) => notifyErr(e),
  })

  const openEditEnvModal = () => { setEditEnvText(toEnvText(vars.filter((v) => v.value !== '***'))); openEditEnv() }

  const confirmClearAll = () =>
    modals.openConfirmModal({
      title: 'Hapus semua variabel',
      children: createElement('span', { style: { fontSize: '0.875rem' } },
        'Hapus semua ', createElement('strong', null, `${vars.length} variabel`), ' dari ',
        createElement('strong', null, `${slug}:${env}`), '? Tidak bisa dibatalkan.'),
      labels: { confirm: 'Hapus Semua', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => clearAll.mutate(),
    })

  const confirmBulkToggle = (targetSecret: boolean) =>
    modals.openConfirmModal({
      title: targetSecret ? 'Jadikan semua Secret' : 'Jadikan semua Plain',
      children: createElement('span', { style: { fontSize: '0.875rem' } },
        targetSecret
          ? [createElement('span', { key: 'a' }, 'Enkripsi '), createElement('strong', { key: 'b' }, `${plainCount} plain var`), createElement('span', { key: 'c' }, ' menjadi secret?')]
          : [createElement('span', { key: 'a' }, 'Dekripsi '), createElement('strong', { key: 'b' }, `${secretCount} secret var`), createElement('span', { key: 'c' }, ' menjadi plain?')],
      ),
      labels: { confirm: targetSecret ? 'Jadikan Secret' : 'Jadikan Plain', cancel: 'Batal' },
      confirmProps: { color: targetSecret ? 'red' : 'gray' },
      onConfirm: () => bulkToggleType.mutate(targetSecret),
    })

  return {
    parsedBulk, parsedEditEnv,
    addVar, deleteVar, updateVar, toggleDisabled,
    clearAll, bulkToggleType, bulkImport, editEnvSave,
    openEditEnvModal, confirmClearAll, confirmBulkToggle,
  }
}
