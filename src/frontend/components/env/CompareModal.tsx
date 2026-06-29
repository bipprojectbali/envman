import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Loader,
  Modal,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  TbArrowRight,
  TbCheck,
  TbCopy,
  TbEye,
  TbEyeOff,
  TbGitCompare,
  TbInfoCircle,
  TbPlus,
  TbRefresh,
} from 'react-icons/tb'
import { DiffList, EmptyState } from '@/frontend/components/env/CompareDiffList'
import { apiFetch } from '@/frontend/lib/api'
import type { Category, DiffRow } from '@/frontend/lib/compare-utils'
import { CATEGORY_META } from '@/frontend/lib/compare-utils'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

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
  const qc = useQueryClient()
  const [localText, setLocalText] = useState('')
  const [filter, setFilter] = useState<'all' | Category>('all')
  const [revealLocal, setRevealLocal] = useState(false)
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

  const localVars = useMemo(() => {
    const result: Record<string, string> = {}
    for (const raw of localText.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1)
      result[key] = value
    }
    return result
  }, [localText])

  const rows: DiffRow[] = useMemo(() => {
    const keys = new Set([...Object.keys(localVars), ...Object.keys(serverVars)])
    const out: DiffRow[] = []
    for (const key of keys) {
      const local = localVars[key]
      const srv = serverVars[key]
      const inLocal = local !== undefined
      const inSrv = srv !== undefined
      if (inLocal && inSrv) {
        if (srv.masked) {
          out.push({ key, category: 'uncertain', localValue: local, isSecret: true })
        } else if (srv.value === local) {
          out.push({ key, category: 'sync', localValue: local, serverValue: srv.value, isSecret: srv.isSecret })
        } else {
          out.push({ key, category: 'diff', localValue: local, serverValue: srv.value, isSecret: srv.isSecret })
        }
      } else if (inLocal) {
        out.push({ key, category: 'onlyLocal', localValue: local, isSecret: false })
      } else {
        out.push({ key, category: 'onlySrv', serverValue: srv.value, isSecret: srv.isSecret })
      }
    }
    out.sort((a, b) => a.key.localeCompare(b.key))
    return out
  }, [localVars, serverVars])

  const counts = useMemo(() => {
    const c: Record<Category, number> = { diff: 0, onlyLocal: 0, onlySrv: 0, sync: 0, uncertain: 0 }
    for (const r of rows) c[r.category]++
    return c
  }, [rows])

  const filteredRows = filter === 'all' ? rows : rows.filter((r) => r.category === filter)

  const upsertOne = (key: string, value: string, isSecret: boolean) =>
    apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
      method: 'POST',
      body: JSON.stringify({ key, value, isSecret }),
    })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] })
    qc.invalidateQueries({ queryKey: ['envman', 'compare', slug, env] })
  }

  const applySingle = useMutation<unknown, Error, DiffRow>({
    mutationFn: (row) => upsertOne(row.key, row.localValue!, row.category === 'onlyLocal' ? addAsSecret : row.isSecret),
    onSuccess: (_, row) => {
      invalidate()
      notifyOk(`${row.key} disinkronkan`)
    },
    onError: (e) => notifyErr(e),
  })

  const applyAllDiff = useMutation<number, Error, void>({
    mutationFn: async () => {
      const targets = rows.filter((r) => r.category === 'diff')
      await Promise.all(targets.map((r) => upsertOne(r.key, r.localValue!, r.isSecret)))
      return targets.length
    },
    onSuccess: (n) => {
      invalidate()
      notifyOk(`${n} variabel di-update dari local`)
    },
    onError: (e) => notifyErr(e),
  })

  const applyAllMissing = useMutation<number, Error, void>({
    mutationFn: async () => {
      const targets = rows.filter((r) => r.category === 'onlyLocal')
      await Promise.all(targets.map((r) => upsertOne(r.key, r.localValue!, addAsSecret)))
      return targets.length
    },
    onSuccess: (n) => {
      invalidate()
      notifyOk(`${n} variabel ditambahkan ke envman`)
    },
    onError: (e) => notifyErr(e),
  })

  const handleClose = () => {
    setLocalText('')
    setFilter('all')
    setRevealLocal(false)
    setAddAsSecret(false)
    onClose()
  }

  const serverAsEnvText = useMemo(() => {
    return Object.entries(serverVars)
      .filter(([, v]) => !v.masked)
      .map(([k, v]) => {
        const needsQuotes =
          v.value.includes(' ') || v.value.includes('#') || v.value.includes('"') || v.value.includes("'")
        return needsQuotes ? `${k}="${v.value.replace(/"/g, '\\"')}"` : `${k}=${v.value}`
      })
      .join('\n')
  }, [serverVars])

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
          {/* LEFT: paste textarea */}
          <Box
            style={{
              width: 380,
              flexShrink: 0,
              borderRight: '1px solid var(--mantine-color-default-border)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Group
              justify="space-between"
              px="md"
              py="xs"
              style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
            >
              <Text size="xs" fw={600} c="dimmed">PASTE .ENV LOCAL</Text>
              <Group gap={4}>
                {Object.keys(localVars).length > 0 && (
                  <Badge size="xs" variant="light" color="blue">
                    {Object.keys(localVars).length} keys
                  </Badge>
                )}
                <Tooltip label={revealLocal ? 'Sembunyikan value' : 'Tampilkan value'}>
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRevealLocal((v) => !v)}>
                    {revealLocal ? <TbEyeOff size={12} /> : <TbEye size={12} />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Textarea
              placeholder={`DATABASE_URL=postgres://...\nAPI_KEY=xxx\nPORT=3000\n\n# Komentar diabaikan`}
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              minRows={20}
              autosize={false}
              styles={{
                wrapper: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
                input: {
                  flex: 1,
                  border: 'none',
                  borderRadius: 0,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  WebkitTextSecurity: revealLocal ? 'none' : 'disc',
                } as CSSProperties,
              }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            />
            {canEdit && counts.onlyLocal > 0 && (
              <Box px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Switch
                  size="xs"
                  label={<Text size="xs">Tambah sebagai secret</Text>}
                  checked={addAsSecret}
                  onChange={(e) => setAddAsSecret(e.currentTarget.checked)}
                />
              </Box>
            )}
          </Box>

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
