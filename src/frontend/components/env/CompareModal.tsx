import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  TbAlertTriangle,
  TbArrowRight,
  TbCheck,
  TbChevronDown,
  TbCopy,
  TbEye,
  TbEyeOff,
  TbGitCompare,
  TbInfoCircle,
  TbMinus,
  TbPlus,
  TbRefresh,
  TbShieldLock,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
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

type Category = 'diff' | 'onlyLocal' | 'onlySrv' | 'sync' | 'uncertain'

interface DiffRow {
  key: string
  category: Category
  localValue?: string
  serverValue?: string
  isSecret: boolean
}

function parseEnvText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const raw of text.split('\n')) {
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
}

const CATEGORY_META: Record<Category, { label: string; color: string; icon: typeof TbGitCompare }> = {
  diff: { label: 'Beda value', color: 'yellow', icon: TbAlertTriangle },
  onlyLocal: { label: 'Hanya di local', color: 'blue', icon: TbPlus },
  onlySrv: { label: 'Hanya di envman', color: 'orange', icon: TbMinus },
  sync: { label: 'Sama', color: 'teal', icon: TbCheck },
  uncertain: { label: 'Tidak bisa dibanding', color: 'gray', icon: TbShieldLock },
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
        const res = await apiFetch<{ vars: Record<string, string> }>(`/api/envman/projects/${slug}/environments/${env}/vars/export`)
        const out: Record<string, ServerVarNorm> = {}
        for (const [k, v] of Object.entries(res.vars)) out[k] = { value: v, isSecret: false, masked: false }
        return out
      }
      const res = await apiFetch<{ vars: Array<{ key: string; value: string; isSecret: boolean }> }>(`/api/envman/projects/${slug}/environments/${env}/vars?limit=10000`)
      const out: Record<string, ServerVarNorm> = {}
      for (const v of res.vars) out[v.key] = { value: v.value, isSecret: v.isSecret, masked: v.value === '***' }
      return out
    },
    enabled: opened,
  })

  const serverVars: Record<string, ServerVarNorm> = data ?? {}

  const localVars = useMemo(() => parseEnvText(localText), [localText])

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
          // VIEWER pada secret — tidak bisa membandingkan
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

  const filteredRows = filter === 'all' ? rows : rows.filter(r => r.category === filter)

  // ── Mutations ────────────────────────────────────────────────────────────
  // Upsert via POST (existing var → update, new var → create).
  const upsertOne = (key: string, value: string, isSecret: boolean) =>
    apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
      method: 'POST', body: JSON.stringify({ key, value, isSecret }),
    })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] })
    qc.invalidateQueries({ queryKey: ['envman', 'compare', slug, env] })
  }

  const applySingle = useMutation<unknown, Error, DiffRow>({
    mutationFn: (row) => upsertOne(row.key, row.localValue!, row.category === 'onlyLocal' ? addAsSecret : row.isSecret),
    onSuccess: (_, row) => { invalidate(); notifyOk(`${row.key} disinkronkan`) },
    onError: (e) => notifyErr(e),
  })

  const applyAllDiff = useMutation<number, Error, void>({
    mutationFn: async () => {
      const targets = rows.filter(r => r.category === 'diff')
      await Promise.all(targets.map(r => upsertOne(r.key, r.localValue!, r.isSecret)))
      return targets.length
    },
    onSuccess: (n) => { invalidate(); notifyOk(`${n} variabel di-update dari local`) },
    onError: (e) => notifyErr(e),
  })

  const applyAllMissing = useMutation<number, Error, void>({
    mutationFn: async () => {
      const targets = rows.filter(r => r.category === 'onlyLocal')
      await Promise.all(targets.map(r => upsertOne(r.key, r.localValue!, addAsSecret)))
      return targets.length
    },
    onSuccess: (n) => { invalidate(); notifyOk(`${n} variabel ditambahkan ke envman`) },
    onError: (e) => notifyErr(e),
  })

  const handleClose = () => {
    setLocalText('')
    setFilter('all')
    setRevealLocal(false)
    setAddAsSecret(false)
    onClose()
  }

  // Build server-as-env text for "Copy envman → local"
  const serverAsEnvText = useMemo(() => {
    return Object.entries(serverVars)
      .filter(([, v]) => !v.masked)
      .map(([k, v]) => {
        const needsQuotes = v.value.includes(' ') || v.value.includes('#') || v.value.includes('"') || v.value.includes("'")
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
          <Badge size="xs" variant="light" color="blue">{slug}:{env}</Badge>
        </Group>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Box style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
        {/* ─── Top toolbar: counters + filter + bulk actions ──────────── */}
        <Box px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <Group justify="space-between" gap="xs" wrap="wrap">
            <Group gap="xs" wrap="wrap">
              {(['diff', 'onlyLocal', 'onlySrv', 'sync', 'uncertain'] as Category[]).map(c => {
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
                      onClick={() => setFilter(prev => prev === c ? 'all' : c)}
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
                  size="xs" color="yellow" variant="light"
                  leftSection={<TbArrowRight size={13} />}
                  loading={applyAllDiff.isPending}
                  onClick={() => applyAllDiff.mutate()}
                >
                  Update {counts.diff} berbeda
                </Button>
              )}
              {canEdit && counts.onlyLocal > 0 && (
                <Button
                  size="xs" color="blue"
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
          <Box style={{ width: 380, flexShrink: 0, borderRight: '1px solid var(--mantine-color-default-border)', display: 'flex', flexDirection: 'column' }}>
            <Group justify="space-between" px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
              <Text size="xs" fw={600} c="dimmed">PASTE .ENV LOCAL</Text>
              <Group gap={4}>
                {Object.keys(localVars).length > 0 && (
                  <Badge size="xs" variant="light" color="blue">{Object.keys(localVars).length} keys</Badge>
                )}
                <Tooltip label={revealLocal ? 'Sembunyikan value' : 'Tampilkan value'}>
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRevealLocal(v => !v)}>
                    {revealLocal ? <TbEyeOff size={12} /> : <TbEye size={12} />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Textarea
              placeholder={`DATABASE_URL=postgres://...\nAPI_KEY=xxx\nPORT=3000\n\n# Komentar diabaikan`}
              value={localText}
              onChange={e => setLocalText(e.target.value)}
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
                } as React.CSSProperties,
              }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            />
            {canEdit && counts.onlyLocal > 0 && (
              <Box px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Switch
                  size="xs"
                  label={<Text size="xs">Tambah sebagai secret</Text>}
                  checked={addAsSecret}
                  onChange={e => setAddAsSecret(e.currentTarget.checked)}
                />
              </Box>
            )}
          </Box>

          {/* RIGHT: diff result */}
          <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!hasInput ? (
              <EmptyState />
            ) : isLoading ? (
              <Group justify="center" mt={120}><Loader /></Group>
            ) : (
              <DiffList
                rows={filteredRows}
                canEdit={canEdit}
                applySingle={applySingle}
                addAsSecret={addAsSecret}
              />
            )}
          </Box>
        </Box>

        {/* ─── Bottom: copy server-as-env helper ─────────────────── */}
        {serverAsEnvText && counts.onlySrv > 0 && (
          <Box px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                <TbInfoCircle size={12} style={{ verticalAlign: 'middle' }} /> {' '}
                Ada {counts.onlySrv} variabel di envman yang belum di local.
              </Text>
              <CopyButton value={serverAsEnvText} timeout={2000}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" variant="light" color={copied ? 'teal' : 'orange'} leftSection={copied ? <TbCheck size={12} /> : <TbCopy size={12} />} onClick={copy}>
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

// ─── Empty state ─────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <Stack align="center" justify="center" style={{ flex: 1 }} gap="md" p="xl">
      <TbGitCompare size={48} opacity={0.3} />
      <Stack gap={4} align="center">
        <Text size="sm" fw={600}>Paste .env local untuk mulai membandingkan</Text>
        <Text size="xs" c="dimmed" ta="center" maw={360}>
          Hasil perbandingan akan tampil di sini: key yang sama, beda value, hanya di local, atau hanya di envman.
        </Text>
      </Stack>
    </Stack>
  )
}

// ─── Diff list rendered as table-like rows ───────────────────────────────
function DiffList({
  rows,
  canEdit,
  applySingle,
  addAsSecret,
}: {
  rows: DiffRow[]
  canEdit: boolean
  applySingle: ReturnType<typeof useMutation<unknown, Error, DiffRow>>
  addAsSecret: boolean
}) {
  const [revealValues, setRevealValues] = useState(false)
  const [expandedAll, setExpandedAll] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (key: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  if (rows.length === 0) {
    return (
      <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs" p="xl">
        <TbCheck size={32} opacity={0.4} />
        <Text size="sm" c="dimmed">Tidak ada perbedaan untuk filter ini.</Text>
      </Stack>
    )
  }
  return (
    <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Group justify="space-between" px="md" py={6} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="xs" fw={600} c="dimmed">HASIL ({rows.length})</Text>
        <Group gap={4}>
          <Tooltip label={expandedAll ? 'Compact semua' : 'Expand semua untuk lihat full value'}>
            <Button
              size="compact-xs" variant="subtle" color="gray"
              leftSection={<TbChevronDown size={11} style={{ transform: expandedAll ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />}
              onClick={() => { setExpandedAll(v => !v); setExpandedRows(new Set()) }}
            >
              {expandedAll ? 'Compact' : 'Expand'}
            </Button>
          </Tooltip>
          <Tooltip label={revealValues ? 'Sembunyikan value' : 'Tampilkan value'}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRevealValues(v => !v)}>
              {revealValues ? <TbEyeOff size={12} /> : <TbEye size={12} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={2} p="xs">
          {rows.map(row => (
            <DiffRowItem
              key={row.key} row={row} canEdit={canEdit} applySingle={applySingle}
              addAsSecret={addAsSecret} revealValues={revealValues}
              expanded={expandedAll || expandedRows.has(row.key)}
              onToggle={() => toggleRow(row.key)}
            />
          ))}
        </Stack>
      </ScrollArea>
    </Box>
  )
}

function DiffRowItem({
  row,
  canEdit,
  applySingle,
  addAsSecret,
  revealValues,
  expanded,
  onToggle,
}: {
  row: DiffRow
  canEdit: boolean
  applySingle: ReturnType<typeof useMutation<unknown, Error, DiffRow>>
  addAsSecret: boolean
  revealValues: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const meta = CATEGORY_META[row.category]
  const Icon = meta.icon
  const showValue = (v: string | undefined) => {
    if (v === undefined) return ''
    if (revealValues) return v
    return v.length > 0 ? '•'.repeat(Math.min(v.length, 12)) : ''
  }
  const showFullValue = (v: string | undefined) => {
    if (v === undefined) return ''
    if (revealValues) return v
    return v.length > 0 ? '•'.repeat(v.length) : ''
  }

  const isPending = applySingle.isPending && applySingle.variables?.key === row.key
  const expandable = row.category !== 'uncertain'

  return (
    <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }} p={0}>
      {/* ── Header row (compact, clickable) ─────────────── */}
      <Group
        gap="xs" wrap="nowrap" align="center" px="sm" py={6}
        style={{ cursor: expandable ? 'pointer' : 'default' }}
        onClick={expandable ? onToggle : undefined}
      >
        <Tooltip label={meta.label} withArrow>
          <Badge size="xs" variant="light" color={meta.color} leftSection={<Icon size={10} />} style={{ flexShrink: 0, minWidth: 22 }}>
            {''}
          </Badge>
        </Tooltip>
        <Code fz={12} style={{ flexShrink: 0, fontWeight: 600 }}>{row.key}</Code>
        {row.isSecret && (
          <Tooltip label="Secret">
            <TbShieldLock size={11} style={{ color: 'var(--mantine-color-red-5)', flexShrink: 0 }} />
          </Tooltip>
        )}

        {/* Value preview (single-line, hidden when expanded) */}
        {!expanded && (
          <Box style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
            {row.category === 'diff' && (
              <>
                <ValuePill value={showValue(row.localValue)} label="local" color="blue" />
                <TbArrowRight size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                <ValuePill value={showValue(row.serverValue)} label="envman" color="orange" struck />
              </>
            )}
            {row.category === 'sync' && (
              <ValuePill value={showValue(row.localValue)} label="sama" color="teal" />
            )}
            {row.category === 'onlyLocal' && (
              <ValuePill value={showValue(row.localValue)} label="local" color="blue" />
            )}
            {row.category === 'onlySrv' && (
              <ValuePill value={showValue(row.serverValue)} label="envman" color="orange" />
            )}
            {row.category === 'uncertain' && (
              <Text size="xs" c="dimmed">Secret di envman — tidak bisa dibandingkan</Text>
            )}
          </Box>
        )}

        {/* Spacer when expanded (push actions/chevron to right) */}
        {expanded && <Box style={{ flex: 1 }} />}

        {/* Per-row actions */}
        <Group gap={4} style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {canEdit && row.category === 'diff' && (
            <Tooltip label="Pakai value local, update ke envman">
              <Button
                size="compact-xs" variant="light" color="yellow"
                leftSection={<TbArrowRight size={11} />}
                loading={isPending}
                onClick={() => applySingle.mutate(row)}
              >
                Update
              </Button>
            </Tooltip>
          )}
          {canEdit && row.category === 'onlyLocal' && (
            <Tooltip label={addAsSecret ? 'Tambah sebagai secret ke envman' : 'Tambah ke envman'}>
              <Button
                size="compact-xs" variant="light" color="blue"
                leftSection={<TbPlus size={11} />}
                loading={isPending}
                onClick={() => applySingle.mutate(row)}
              >
                Tambah
              </Button>
            </Tooltip>
          )}
          {row.category === 'onlySrv' && row.serverValue && (
            <CopyButton value={`${row.key}=${row.serverValue}`} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label="Copy line">
                  <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                    {copied ? <TbCheck size={12} /> : <TbCopy size={12} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
        </Group>

        {/* Expand chevron */}
        {expandable && (
          <TbChevronDown
            size={14}
            style={{
              flexShrink: 0,
              opacity: 0.5,
              transition: 'transform 0.15s',
              transform: expanded ? 'rotate(180deg)' : undefined,
            }}
          />
        )}
      </Group>

      {/* ── Expanded body: full multi-line values ─────────── */}
      {expanded && expandable && (
        <Box px="sm" pb="sm" pt={4} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {row.category === 'diff' && (
            <Stack gap={6} mt={6}>
              <ValueBlock label="local" value={showFullValue(row.localValue)} rawValue={row.localValue} color="blue" />
              <ValueBlock label="envman (akan diganti)" value={showFullValue(row.serverValue)} rawValue={row.serverValue} color="orange" struck />
            </Stack>
          )}
          {row.category === 'sync' && (
            <Box mt={6}>
              <ValueBlock label="sama di kedua sisi" value={showFullValue(row.localValue)} rawValue={row.localValue} color="teal" />
            </Box>
          )}
          {row.category === 'onlyLocal' && (
            <Box mt={6}>
              <ValueBlock label="local (akan ditambahkan)" value={showFullValue(row.localValue)} rawValue={row.localValue} color="blue" />
            </Box>
          )}
          {row.category === 'onlySrv' && (
            <Box mt={6}>
              <ValueBlock label="envman (belum di local)" value={showFullValue(row.serverValue)} rawValue={row.serverValue} color="orange" />
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

// ─── Compact single-line preview pill ───────────────────────────────────
function ValuePill({ value, label, color, struck }: { value: string; label: string; color: string; struck?: boolean }) {
  return (
    <Box style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{label}:</Text>
      <Code
        fz={11}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: `var(--mantine-color-${color}-${struck ? '5' : '7'})`,
          textDecoration: struck ? 'line-through' : undefined,
          opacity: struck ? 0.7 : 1,
        }}
        title={value}
      >
        {value || '(kosong)'}
      </Code>
    </Box>
  )
}

// ─── Expanded multi-line block with copy button ─────────────────────────
function ValueBlock({
  label,
  value,
  rawValue,
  color,
  struck,
}: {
  label: string
  value: string
  rawValue: string | undefined
  color: string
  struck?: boolean
}) {
  const chars = rawValue?.length ?? 0
  const lines = rawValue?.split('\n').length ?? 0
  return (
    <Box>
      <Group gap={6} mb={3} justify="space-between">
        <Group gap={6}>
          <Badge size="xs" variant="filled" color={color}>{label}</Badge>
          <Text size="xs" c="dimmed">{chars} chars{lines > 1 && ` · ${lines} baris`}</Text>
        </Group>
        {rawValue !== undefined && rawValue.length > 0 && (
          <CopyButton value={rawValue} timeout={2000}>
            {({ copied, copy }) => (
              <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} title="Copy value">
                {copied ? <TbCheck size={11} /> : <TbCopy size={11} />}
              </ActionIcon>
            )}
          </CopyButton>
        )}
      </Group>
      <Box
        component="pre"
        style={{
          margin: 0,
          padding: '8px 10px',
          background: 'var(--mantine-color-default-hover)',
          border: `1px solid var(--mantine-color-${color}-light-color)`,
          borderRadius: 4,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          color: `var(--mantine-color-${color}-${struck ? '5' : '8'})`,
          textDecoration: struck ? 'line-through' : undefined,
          opacity: struck ? 0.75 : 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 240,
          overflowY: 'auto',
        }}
      >
        {value || <Text component="span" c="dimmed" fs="italic">(kosong)</Text>}
      </Box>
    </Box>
  )
}
