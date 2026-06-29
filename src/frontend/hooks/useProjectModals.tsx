import { Group, Text, ThemeIcon } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { TbPower, TbTrash } from 'react-icons/tb'
import { DeleteProjectConfirm } from '@/frontend/components/projects/DeleteProjectConfirm'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface Props {
  toggleActive: { mutate: (args: { slug: string; isActive: boolean }) => void }
  setPinned: (fn: (prev: string[]) => string[]) => void
}

export function useProjectModals({ toggleActive, setPinned }: Props) {
  const qc = useQueryClient()

  const confirmToggleActive = (slug: string, name: string, currentActive: boolean) => {
    modals.openConfirmModal({
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color={currentActive ? 'orange' : 'teal'} radius="md">
            <TbPower size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            {currentActive ? 'Nonaktifkan project' : 'Aktifkan project'}
          </Text>
        </Group>
      ),
      children: (
        <Text size="sm">
          {currentActive ? (
            <>Project <strong>{name}</strong> akan dinonaktifkan. Environment dan variabelnya tetap tersimpan, tapi project tidak akan muncul di filter "Aktif".</>
          ) : (
            <>Project <strong>{name}</strong> akan diaktifkan kembali.</>
          )}
        </Text>
      ),
      labels: { confirm: currentActive ? 'Nonaktifkan' : 'Aktifkan', cancel: 'Batal' },
      confirmProps: { color: currentActive ? 'orange' : 'teal' },
      onConfirm: () => toggleActive.mutate({ slug, isActive: !currentActive }),
    })
  }

  const deleteProject = (slug: string, name: string) => {
    const id = `delete-project-${slug}`
    modals.open({
      modalId: id,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">Hapus project</Text>
        </Group>
      ),
      children: (
        <DeleteProjectConfirm
          name={name}
          slug={slug}
          onCancel={() => modals.close(id)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/projects/${slug}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['envman', 'projects'] })
              setPinned((prev) => prev.filter((s) => s !== slug))
              notifyOk(`Project "${name}" dihapus`)
              modals.close(id)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  return { confirmToggleActive, deleteProject }
}
