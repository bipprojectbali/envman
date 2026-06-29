import { Alert, Badge, Box, Button, Checkbox, Divider, Group, Radio, ScrollArea, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbInfoCircle } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyBulkResult, runBulk } from '@/frontend/lib/bulk'
import { type EnvRole, envRoleOptions, type Member, roleColor } from './types'

export function BulkEnvAccessModal({
  slug,
  selected,
  members,
  environments,
  onClose,
}: {
  slug: string
  selected: string[]
  members: Member[]
  environments: { name: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [envSelected, setEnvSelected] = useState<Set<string>>(new Set())
  const [role, setRole] = useState<EnvRole>('inherit')
  const [submitting, setSubmitting] = useState(false)

  const selectedMembers = members.filter((m) => selected.includes(m.user.id))
  const allEnvSelected = environments.length > 0 && environments.every((e) => envSelected.has(e.name))
  const someEnvSelected = environments.some((e) => envSelected.has(e.name)) && !allEnvSelected

  const toggleEnv = (name: string) =>
    setEnvSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const toggleAllEnvs = () => setEnvSelected(allEnvSelected ? new Set() : new Set(environments.map((e) => e.name)))

  const pairs: { userId: string; envName: string }[] = []
  for (const m of selectedMembers) for (const env of envSelected) pairs.push({ userId: m.user.id, envName: env })

  const submit = async () => {
    if (pairs.length === 0) return
    setSubmitting(true)
    const summary = await runBulk(pairs, (p) =>
      apiFetch(`/api/envman/projects/${slug}/environments/${p.envName}/members/${p.userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    )
    setSubmitting(false)
    notifyBulkResult(
      summary,
      (n) => `${n} akses diperbarui ke ${role}`,
      (n) => `${n} gagal`,
    )
    qc.invalidateQueries({ queryKey: ['envman', 'access-matrix', slug] })
    qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
    onClose()
  }

  return (
    <Stack gap="md">
      <Box>
        <Text size="sm" mb={4}>
          <strong>{selected.length}</strong> anggota × <strong>{envSelected.size}</strong> environment ={' '}
          <strong>{pairs.length}</strong> perubahan
        </Text>
        <Group gap={4}>
          {selectedMembers.slice(0, 4).map((m) => (
            <Badge key={m.id} size="xs" variant="light" color={roleColor[m.role]}>
              {m.user.name}
            </Badge>
          ))}
          {selectedMembers.length > 4 && (
            <Badge size="xs" variant="outline" color="gray">
              +{selectedMembers.length - 4}
            </Badge>
          )}
        </Group>
      </Box>

      <Divider />

      <Box>
        <Group justify="space-between" align="center" mb="xs">
          <Text size="sm" fw={600}>
            Environment
          </Text>
          <Checkbox
            size="xs"
            label={
              <Text size="xs" fw={600}>
                {allEnvSelected ? 'Batal semua' : `Pilih semua (${environments.length})`}
              </Text>
            }
            checked={allEnvSelected}
            indeterminate={someEnvSelected}
            onChange={toggleAllEnvs}
          />
        </Group>
        <ScrollArea.Autosize mah={200} type="scroll">
          <Stack gap={2}>
            {environments.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="xs">
                Project ini belum punya environment
              </Text>
            ) : (
              environments.map((env) => (
                <Group
                  key={env.name}
                  gap="xs"
                  wrap="nowrap"
                  px={4}
                  py={4}
                  style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-xs)' }}
                  onClick={() => toggleEnv(env.name)}
                >
                  <Checkbox
                    size="xs"
                    checked={envSelected.has(env.name)}
                    onChange={() => toggleEnv(env.name)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Text size="sm">{env.name}</Text>
                </Group>
              ))
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Box>

      <Divider />

      <Radio.Group value={role} onChange={(v) => setRole(v as EnvRole)} label="Akses">
        <Stack gap="xs" mt="xs">
          {envRoleOptions.map((opt) => (
            <Radio key={opt.value} value={opt.value} label={opt.label} />
          ))}
        </Stack>
      </Radio.Group>

      <Alert color="blue" icon={<TbInfoCircle size={13} />} variant="light">
        <Text size="xs">
          Last-owner-of-env protection berlaku di server. Operasi yang menurunkan OWNER terakhir di sebuah env akan
          ditolak per-item; sisanya tetap berhasil.
        </Text>
      </Alert>

      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="sm" onClick={onClose} disabled={submitting}>
          Batal
        </Button>
        <Button size="sm" color="grape" onClick={submit} loading={submitting} disabled={pairs.length === 0}>
          Terapkan ({pairs.length})
        </Button>
      </Group>
    </Stack>
  )
}
