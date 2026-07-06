import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbInfoCircle, TbLink, TbPencil, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'
import { ImportKeyPicker } from './ImportKeyPicker'

interface ImportLink {
  id: string
  order: number
  keys: string[]
  sourceProject: string
  sourceProjectName: string
  sourceEnv: string
  createdAt: string
}

interface ProjectListItem {
  slug: string
  name: string
  environments?: { name: string }[]
}

interface ImportManagerModalProps {
  opened: boolean
  onClose: () => void
  slug: string
  env: string
}

// Modal khusus OWNER untuk kelola live-link import env target dari env lain (lintas project).
// List link existing + tambah (pilih source project → source env) + hapus.
export function ImportManagerModal({ opened, onClose, slug, env }: ImportManagerModalProps) {
  const qc = useQueryClient()
  const [srcProject, setSrcProject] = useState<string | null>(null)
  const [srcEnv, setSrcEnv] = useState<string | null>(null)
  const [srcKeys, setSrcKeys] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKeys, setEditKeys] = useState<string[]>([])

  const { data: importsData, isLoading: importsLoading } = useQuery({
    queryKey: ['envman', 'imports', slug, env],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}/environments/${env}/imports`),
    enabled: opened,
  })
  const { data: projectsData } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
    enabled: opened,
  })

  const imports: ImportLink[] = importsData?.imports ?? []
  const projects: ProjectListItem[] = projectsData?.projects ?? []

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.slug, label: `${p.name} (${p.slug})` })),
    [projects],
  )
  const envOptions = useMemo(() => {
    const proj = projects.find((p) => p.slug === srcProject)
    return (proj?.environments ?? [])
      .filter((e) => !(srcProject === slug && e.name === env)) // jangan tawarkan diri sendiri
      .map((e) => ({ value: e.name, label: e.name }))
  }, [projects, srcProject, slug, env])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['envman', 'imports', slug, env] })
    qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] })
  }

  const addImport = useMutation({
    mutationFn: () =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/imports`, {
        method: 'POST',
        body: JSON.stringify({ sourceProject: srcProject, sourceEnv: srcEnv, keys: srcKeys }),
      }),
    onSuccess: () => {
      notifyOk('Import ditambahkan')
      setSrcProject(null)
      setSrcEnv(null)
      setSrcKeys([])
      invalidate()
    },
    onError: (e) => notifyErr(e),
  })

  const updateImport = useMutation({
    mutationFn: (v: { id: string; keys: string[] }) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/imports/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ keys: v.keys }),
      }),
    onSuccess: () => {
      notifyOk('Whitelist key diperbarui')
      setEditingId(null)
      invalidate()
    },
    onError: (e) => notifyErr(e),
  })

  const removeImport = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${env}/imports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notifyOk('Import dihapus')
      invalidate()
    },
    onError: (e) => notifyErr(e),
  })

  return (
    <Modal opened={opened} onClose={onClose} title="Import dari env lain" size="lg">
      <Stack gap="md">
        <Alert color="blue" icon={<TbInfoCircle size={16} />} variant="light" p="xs">
          <Text fz="xs">
            Vars dari env source di-resolve <strong>live</strong> (bukan disalin). Ubah di source → otomatis ikut di
            sini. Var lokal dengan key sama <strong>selalu menang</strong>.
          </Text>
        </Alert>

        <Stack gap="xs">
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              label="Project source"
              placeholder="Pilih project"
              data={projectOptions}
              value={srcProject}
              onChange={(v) => {
                setSrcProject(v)
                setSrcEnv(null)
                setSrcKeys([])
              }}
              searchable
              style={{ flex: 1 }}
              size="xs"
            />
            <Select
              label="Env source"
              placeholder="Pilih env"
              data={envOptions}
              value={srcEnv}
              onChange={(v) => {
                setSrcEnv(v)
                setSrcKeys([])
              }}
              disabled={!srcProject}
              searchable
              style={{ flex: 1 }}
              size="xs"
            />
          </Group>
          {srcProject && srcEnv && (
            <ImportKeyPicker slug={srcProject} env={srcEnv} selected={srcKeys} onChange={setSrcKeys} />
          )}
          <Button
            leftSection={<TbLink size={14} />}
            onClick={() => addImport.mutate()}
            loading={addImport.isPending}
            disabled={!srcProject || !srcEnv}
            size="xs"
            style={{ alignSelf: 'flex-start' }}
          >
            Link{srcKeys.length > 0 ? ` ${srcKeys.length} key` : ' semua'}
          </Button>
        </Stack>

        <Stack gap={6}>
          <Text fz="xs" c="dimmed" fw={600}>
            Link aktif
          </Text>
          {importsLoading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : imports.length === 0 ? (
            <Text fz="xs" c="dimmed" fs="italic">
              Belum ada import. Pilih project + env source di atas lalu klik Link.
            </Text>
          ) : (
            imports.map((imp) => (
              <Stack key={imp.id} gap={4}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap={6} wrap="nowrap">
                    <Badge size="sm" variant="light" color="grape" leftSection={<TbLink size={10} />}>
                      {imp.sourceProject}:{imp.sourceEnv}
                    </Badge>
                    <Code fz={10}>{imp.sourceProjectName}</Code>
                    <Badge size="xs" variant="outline" color={imp.keys.length > 0 ? 'blue' : 'gray'}>
                      {imp.keys.length > 0 ? `${imp.keys.length} key` : 'semua key'}
                    </Badge>
                  </Group>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label="Ubah key yang di-import">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="blue"
                        onClick={() => {
                          setEditingId(editingId === imp.id ? null : imp.id)
                          setEditKeys(imp.keys)
                        }}
                      >
                        <TbPencil size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Hapus link">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        loading={removeImport.isPending && removeImport.variables === imp.id}
                        onClick={() => removeImport.mutate(imp.id)}
                      >
                        <TbTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                {editingId === imp.id && (
                  <Stack gap={6} pl="sm" style={{ borderLeft: '2px solid var(--mantine-color-blue-light)' }}>
                    <ImportKeyPicker slug={imp.sourceProject} env={imp.sourceEnv} selected={editKeys} onChange={setEditKeys} />
                    <Group gap="xs">
                      <Button
                        size="xs"
                        loading={updateImport.isPending}
                        onClick={() => updateImport.mutate({ id: imp.id, keys: editKeys })}
                      >
                        Simpan
                      </Button>
                      <Button size="xs" variant="subtle" color="gray" onClick={() => setEditingId(null)}>
                        Batal
                      </Button>
                    </Group>
                  </Stack>
                )}
              </Stack>
            ))
          )}
        </Stack>
      </Stack>
    </Modal>
  )
}
