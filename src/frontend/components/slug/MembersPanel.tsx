import { SegmentedControl, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { notifyBulkResult, runBulk } from '@/frontend/lib/bulk'
import { BulkEnvAccessModal } from './members/BulkEnvAccessModal'
import { BulkRoleModal } from './members/BulkRoleModal'
import { MembersAddSection } from './members/MembersAddSection'
import { MembersBulkBar } from './members/MembersBulkBar'
import { MembersMatrixView } from './members/MembersMatrixView'
import { SectionMatrixView } from './members/SectionMatrixView'
import { type Member, toggle } from './members/types'

export function MembersPanel({
  slug,
  members,
  environments,
  isOwner,
  myUserId: _myUserId,
  onRefresh,
}: {
  slug: string
  members: Member[]
  environments: { name: string }[]
  isOwner: boolean
  myUserId: string
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [matrixView, setMatrixView] = useState<'environments' | 'sections'>('environments')

  const ownerCount = members.filter((m) => m.role === 'OWNER').length
  const selectableMembers = members.filter((m) => !(m.role === 'OWNER' && ownerCount === 1))

  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const summary = await runBulk(userIds, (userId) =>
        apiFetch(`/api/envman/projects/${slug}/members/${userId}`, { method: 'DELETE' }),
      )
      return summary
    },
    onSuccess: (summary) => {
      notifyBulkResult(
        summary,
        (n) => `${n} anggota dihapus`,
        (n) => `${n} gagal dihapus`,
      )
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
      qc.invalidateQueries({ queryKey: ['envman', 'available-users', slug] })
      onRefresh()
    },
  })

  const confirmBulkDelete = () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const names = members.filter((m) => ids.includes(m.user.id)).map((m) => m.user.name)
    modals.openConfirmModal({
      title: `Hapus ${ids.length} Anggota`,
      children: (
        <Text size="sm">
          Hapus <strong>{names.slice(0, 5).join(', ')}</strong>
          {names.length > 5 ? ` …dan ${names.length - 5} lainnya` : ''}?
        </Text>
      ),
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => bulkDeleteMutation.mutate(ids),
    })
  }

  const openBulkRoleModal = () => {
    const id = 'bulk-role-modal'
    modals.open({
      modalId: id,
      title: 'Ubah role anggota',
      size: 'md',
      children: (
        <BulkRoleModal
          slug={slug}
          selected={[...selected]}
          members={members}
          onClose={() => {
            modals.close(id)
            setSelected(new Set())
          }}
        />
      ),
    })
  }

  const openBulkEnvModal = () => {
    const id = 'bulk-env-modal'
    modals.open({
      modalId: id,
      title: 'Set akses environment',
      size: 'lg',
      children: (
        <BulkEnvAccessModal
          slug={slug}
          selected={[...selected]}
          members={members}
          environments={environments}
          onClose={() => {
            modals.close(id)
            setSelected(new Set())
          }}
        />
      ),
    })
  }

  return (
    <Stack gap="md">
      {isOwner && <MembersAddSection slug={slug} onAdded={onRefresh} />}

      <SegmentedControl
        size="xs"
        value={matrixView}
        onChange={(v) => setMatrixView(v as 'environments' | 'sections')}
        data={[
          { value: 'environments', label: 'Environments' },
          { value: 'sections', label: 'Sections' },
        ]}
      />

      {matrixView === 'environments' ? (
        <>
          <MembersMatrixView
            slug={slug}
            selected={selected}
            onToggleSelect={(uid) => setSelected((prev) => toggle(prev, uid))}
            onToggleAll={(ids) => {
              const all = ids.every((id) => selected.has(id))
              setSelected(all ? new Set() : new Set(ids))
            }}
            selectableIds={new Set(selectableMembers.map((m) => m.user.id))}
          />

          {isOwner && (
            <MembersBulkBar
              count={selected.size}
              onChangeRole={openBulkRoleModal}
              onSetEnvAccess={openBulkEnvModal}
              onDelete={confirmBulkDelete}
              busy={bulkDeleteMutation.isPending}
            />
          )}
        </>
      ) : (
        <SectionMatrixView slug={slug} />
      )}
    </Stack>
  )
}
