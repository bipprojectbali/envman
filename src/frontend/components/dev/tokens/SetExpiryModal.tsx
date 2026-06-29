import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import type { AdminToken } from './types'

export function SetExpiryModal({ token, onClose }: { token: AdminToken; onClose: () => void }) {
  const [val, setVal] = useState(token.expiresAt ? token.expiresAt.slice(0, 10) : '')
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/tokens/${token.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-expiry', expiresAt: val || null }),
      }),
    onSuccess: () => {
      notifyOk('Expiry diperbarui')
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] })
      onClose()
    },
    onError: (e) => notifyErr(e),
  })
  return (
    <Stack gap="sm">
      <Text size="sm">
        Token: <strong>{token.name}</strong> ({token.user.email})
      </Text>
      <TextInput
        type="date"
        label="Expiry baru (kosongkan = tidak ada)"
        value={val}
        onChange={(e) => setVal(e.currentTarget.value)}
        min={new Date().toISOString().slice(0, 10)}
      />
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onClose}>
          Batal
        </Button>
        <Button loading={mut.isPending} onClick={() => mut.mutate()}>
          Simpan
        </Button>
      </Group>
    </Stack>
  )
}
