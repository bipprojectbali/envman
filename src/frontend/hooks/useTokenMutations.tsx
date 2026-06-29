import { createElement, useState } from 'react'
import { modals } from '@mantine/modals'
import { useMutation } from '@tanstack/react-query'
import { TbRefresh } from 'react-icons/tb'
import type { QueryClient } from '@tanstack/react-query'
import type { useNavigate } from '@tanstack/react-router'
import { RevokeTokenConfirm } from '@/frontend/components/tokens/RevokeTokenConfirm'
import type { ApiToken } from '@/frontend/components/tokens/token-utils'
import type { TokenFormState } from '@/frontend/components/tokens/TokenForm'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface Params {
  editingToken: ApiToken | null
  qc: QueryClient
  setNewToken: (val: string | null) => void
  setForm: (val: TokenFormState) => void
  emptyForm: TokenFormState
  navigate: ReturnType<typeof useNavigate>
}

export function useTokenMutations({ editingToken, qc, setNewToken, setForm, emptyForm, navigate }: Params) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revealedValue, setRevealedValue] = useState<{ id: string; token: string } | null>(null)

  const goToList = () => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })

  const createToken = useMutation({
    mutationFn: (body: TokenFormState) =>
      apiFetch('/api/envman/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || undefined, scopes: body.scopes, tags: body.tags }),
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(d.token)
      setForm(emptyForm)
      goToList()
      notifyOk('Token berhasil dibuat — salin nilainya sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const editToken = useMutation({
    mutationFn: (body: TokenFormState) =>
      apiFetch(`/api/envman/tokens/${editingToken!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: body.name, canWrite: body.canWrite, expiresAt: body.expiresAt || null, scopes: body.scopes, tags: body.tags }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      navigate({ to: '/envmanager/tokens', search: { token: editingToken!.id, edit: undefined } })
      notifyOk('Token diperbarui')
    },
    onError: (e) => notifyErr(e),
  })

  const toggleToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: (d: { isDisabled: boolean }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      notifyOk(d.isDisabled ? 'Token dinonaktifkan' : 'Token diaktifkan')
    },
    onError: (e) => notifyErr(e),
  })

  const copyToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/reveal`),
    onSuccess: async (d: { token: string }, id) => {
      try {
        await navigator.clipboard.writeText(d.token)
        setCopiedId(id)
        setRevealedValue({ id, token: d.token })
        notifyOk('Token disalin ke clipboard')
        setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500)
      } catch {
        notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
      }
    },
    onError: (e) => notifyErr(e),
  })

  const handleCopyCommand = async (tokenId: string, cmdTemplate: string) => {
    try {
      let tokenVal: string
      if (revealedValue?.id === tokenId) {
        tokenVal = revealedValue.token
      } else {
        const d: { token: string } = await apiFetch(`/api/envman/tokens/${tokenId}/reveal`)
        tokenVal = d.token
        setRevealedValue({ id: tokenId, token: tokenVal })
        setCopiedId(tokenId)
        setTimeout(() => setCopiedId((prev) => (prev === tokenId ? null : prev)), 1500)
      }
      await navigator.clipboard.writeText(cmdTemplate.replace(/\[TOKEN\]/g, tokenVal))
      notifyOk('Command disalin ke clipboard')
    } catch {
      notifyErr(new Error('Gagal akses clipboard — coba browser modern atau HTTPS'))
    }
  }

  const rotateToken = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/envman/tokens/${id}/rotate`, { method: 'POST' }),
    onSuccess: (d: { token: string }) => {
      qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
      setNewToken(d.token)
      notifyOk('Token di-rotate — salin nilai baru sekarang!')
    },
    onError: (e) => notifyErr(e),
  })

  const confirmRotate = (id: string, name: string) => {
    modals.openConfirmModal({
      title: createElement('span', { style: { fontWeight: 600 } }, 'Rotate token'),
      children: `Token "${name}" akan diganti dengan nilai baru. Nilai lama langsung invalid.`,
      labels: { confirm: 'Rotate token', cancel: 'Batal' },
      confirmProps: { color: 'yellow', leftSection: createElement(TbRefresh, { size: 13 }) },
      onConfirm: () => rotateToken.mutate(id),
    })
  }

  const revokeToken = (id: string, name: string) => {
    const modalId = `revoke-token-${id}`
    modals.open({
      modalId,
      title: 'Revoke token',
      children: createElement(RevokeTokenConfirm, {
        name,
        onCancel: () => modals.close(modalId),
        onConfirm: async () => {
          await apiFetch(`/api/envman/tokens/${id}`, { method: 'DELETE' })
          qc.invalidateQueries({ queryKey: ['envman', 'tokens'] })
          notifyOk(`Token "${name}" direvoke`)
          modals.close(modalId)
        },
      }),
    })
  }

  return {
    createToken, editToken, toggleToken, copyToken, handleCopyCommand,
    rotateToken, confirmRotate, revokeToken,
    copiedId, goToList,
  }
}
