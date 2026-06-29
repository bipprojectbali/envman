import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Loader,
  Modal,
  Text,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useCompareState } from '@/frontend/hooks/useCompareState'
import {
  TbArrowRight,
  TbCheck,
  TbCopy,
  TbGitCompare,
  TbInfoCircle,
  TbPlus,
  TbRefresh,
} from 'react-icons/tb'
import { CompareTextInput } from './CompareTextInput'
import { DiffList, EmptyState } from '@/frontend/components/env/CompareDiffList'
import { apiFetch } from '@/frontend/lib/api'
import type { Category } from '@/frontend/lib/compare-utils'
import { CATEGORY_META } from '@/frontend/lib/compare-utils'

interface CompareModalProps {
  opened: boolean
  onClose: () => void
  slug: string
  env: string
  canEdit: boolean
}

interface ServerVarNorm {
  value: string
  isSecret: boolean
  masked: boolean
}

export function CompareModal({ opened, onClose, slug, env, canEdit }: CompareModalProps) {
  const [localText, setLocalText] = useState('')
  const [addAsSecret, setAddAsSecret] = useState(false)

  // Fetch ALL server vars when modal opens.
  // EDITOR+: export endpoint (decrypted). VIEWER: vars list with large limit (secrets masked).
  const { data, isLoading, refetch } = useQuery<Record<string, ServerVarNorm>>({
    queryKey: ['envman', 'compare', slug, env, canEdit],
    queryFn: async () => {
      if (canEdit) {
        const res = await apiFetch<{ vars: Record<string, string> }>(
          `/api/envman/projects/${slug}/environments/${env}/vars/export`,
        )
        const out: Record<string, ServerVarNorm> = {}
        for (const [k, v] of Object.entries(res.vars)) out[k] = { value: v, isSecret: false, masked: false }
        return out
      }
      const res = await apiFetch<{ vars: Array<{ key: string; value: string; isSecret: boolean }> }>(
        `/api/envman/projects/${slug}/environments/${env}/vars?limit=10000`,
      )
      const out: Record<string, ServerVarNorm> = {}
      for (const v of res.vars) out[v.key] = { value: v.value, isSecret: v.isSecret, masked: v.value === '***' }
      return out
    },
    enabled: opened,
  })

  const serverVars: Record<string, ServerVarNorm> = data ?? {}
  const { localVars, counts, filter, setFilter, filteredRows, applySingle, applyAllDiff, applyAllMissing, serverAsEnvText } =
    useCompareState({ slug, env, serverVars, localText, addAsSecret })

  const handleClose = () => {
    setLocalText('')
    setFilter('all')
    setAddAsSecret(false)
    onClose()
  }

  const hasInput = localText.trim().length > 0

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      fullScreen
      withCloseButton
      title={
        <Group gap="xs">
          <TbGitCompare size={18} />
          <Text fw={600}>Bandingkan dengan .env local</Text>
          <Badge size="xs" variant="light" color="blue">
            {slug}:{env}
          </Badge>
        </Group>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Box style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
        {/* ─── Top toolbar: counters + filter + bulk actions ──────────── */}
        <Box px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <Group justify="space-between" gap="xs" wrap="wrap">
            <Group gap="xs" wrap="wrap">
              {(['diff', 'onlyLocal', 'onlySrv', 'sync', 'uncertain'] as Category[]).map((c) => {
                const meta = CATEGORY_META[c]
                const Icon = meta.icon
                const n = counts[c]
                if (c === 'uncertain' && n === 0) return null
                return (
                  <Tooltip key={c} label={meta.label} withArrow>
                    <Badge
                      size="md"
                      variant={filter === c ? 'filled' : 'light'}
                      color={meta.color}
                      leftSection={<Icon size={12} />}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setFilter((prev) => (prev === c ? 'all' : c))}
                    >
                      {n} {meta.label}
                    </Badge>
                  </Tooltip>
                )
              })}
              {filter !== 'all' && (
                <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setFilter('all')}>
                  Reset filter
                </Button>
              )}
            </Group>
            <Group gap="xs">
              <Tooltip label="Refresh data envman">
                <ActionIcon size="md" variant="subtle" color="gray" onClick={() => refetch()} loading={isLoading}>
                  <TbRefresh size={14} />
                </ActionIcon>
              </Tooltip>
              {canEdit && counts.diff > 0 && (
                <Button
                  size="xs"
                  color="yellow"
                  variant="light"
                  leftSection={<TbArrowRight size={13} />}
                  loading={applyAllDiff.isPending}
                  onClick={() => applyAllDiff.mutate()}
                >
                  Update {counts.diff} berbeda
                </Button>
              )}
              {canEdit && counts.onlyLocal > 0 && (
                <Button
                  size="xs"
                  color="blue"
                  leftSection={<TbPlus size={13} />}
                  loading={applyAllMissing.isPending}
                  onClick={() => applyAllMissing.mutate()}
                >
                  Tambah {counts.onlyLocal} baru
                </Button>
              )}
            </Group>
          </Group>
        </Box>

        {/* ─── Split: paste area | diff result ──────────────────────── */}
        <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CompareTextInput
            localText={localText}
            onChange={setLocalText}
            localVarCount={Object.keys(localVars).length}
            canEdit={canEdit}
            onlyLocalCount={counts.onlyLocal}
            addAsSecret={addAsSecret}
            onAddAsSecretChange={setAddAsSecret}
          />

          {/* RIGHT: diff result */}
          <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!hasInput ? (
              <EmptyState />
            ) : isLoading ? (
              <Group justify="center" mt={120}>
                <Loader />
              </Group>
            ) : (
              <DiffList rows={filteredRows} canEdit={canEdit} applySingle={applySingle} addAsSecret={addAsSecret} />
            )}
          </Box>
        </Box>

        {/* ─── Bottom: copy server-as-env helper ─────────────────── */}
        {serverAsEnvText && counts.onlySrv > 0 && (
          <Box px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                <TbInfoCircle size={12} style={{ verticalAlign: 'middle' }} /> Ada {counts.onlySrv} variabel di envman
                yang belum di local.
              </Text>
              <CopyButton value={serverAsEnvText} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color={copied ? 'teal' : 'orange'}
                    leftSection={copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                    onClick={copy}
                  >
                    {copied ? 'Disalin' : `Copy semua envman → clipboard`}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Box>
        )}
      </Box>
    </Modal>
  )
}
