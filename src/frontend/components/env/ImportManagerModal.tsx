import { ActionIcon, Alert, Badge, Button, Code, Group, Loader, Modal, Select, Stack, Text, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbInfoCircle, TbLink, TbTrash } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface ImportLink {
  id: string
  order: number
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
        body: JSON.stringify({ sourceProject: srcProject, sourceEnv: srcEnv }),
      }),
    onSuccess: () => {
      notifyOk('Import ditambahkan')
      setSrcProject(null)
      setSrcEnv(null)
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

        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Select
            label="Project source"
            placeholder="Pilih project"
            data={projectOptions}
            value={srcProject}
            onChange={(v) => {
              setSrcProject(v)
              setSrcEnv(null)
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
            onChange={setSrcEnv}
            disabled={!srcProject}
            searchable
            style={{ flex: 1 }}
            size="xs"
          />
          <Button
            leftSection={<TbLink size={14} />}
            onClick={() => addImport.mutate()}
            loading={addImport.isPending}
            disabled={!srcProject || !srcEnv}
            size="xs"
          >
            Link
          </Button>
        </Group>

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
              <Group key={imp.id} justify="space-between" wrap="nowrap" gap="xs">
                <Group gap={6} wrap="nowrap">
                  <Badge size="sm" variant="light" color="grape" leftSection={<TbLink size={10} />}>
                    {imp.sourceProject}:{imp.sourceEnv}
                  </Badge>
                  <Code fz={10}>{imp.sourceProjectName}</Code>
                </Group>
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
            ))
          )}
        </Stack>
      </Stack>
    </Modal>
  )
}
