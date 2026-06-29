import { ActionIcon, Badge, Box, Button, Code, CopyButton, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { TbArrowRight, TbCheck, TbChevronDown, TbCopy, TbPlus, TbShieldLock } from 'react-icons/tb'
import type { DiffRow } from '@/frontend/lib/compare-utils'
import { CATEGORY_META } from '@/frontend/lib/compare-utils'

export function DiffRowItem({
  row, canEdit, applySingle, addAsSecret, revealValues, expanded, onToggle,
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
      <Group gap="xs" wrap="nowrap" align="center" px="sm" py={6}
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

        {!expanded && (
          <Box style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
            {row.category === 'diff' && (
              <>
                <ValuePill value={showValue(row.localValue)} label="local" color="blue" />
                <TbArrowRight size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                <ValuePill value={showValue(row.serverValue)} label="envman" color="orange" struck />
              </>
            )}
            {row.category === 'sync' && <ValuePill value={showValue(row.localValue)} label="sama" color="teal" />}
            {row.category === 'onlyLocal' && <ValuePill value={showValue(row.localValue)} label="local" color="blue" />}
            {row.category === 'onlySrv' && <ValuePill value={showValue(row.serverValue)} label="envman" color="orange" />}
            {row.category === 'uncertain' && <Text size="xs" c="dimmed">Secret di envman — tidak bisa dibandingkan</Text>}
          </Box>
        )}

        {expanded && <Box style={{ flex: 1 }} />}

        <Group gap={4} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {canEdit && row.category === 'diff' && (
            <Tooltip label="Pakai value local, update ke envman">
              <Button size="compact-xs" variant="light" color="yellow" leftSection={<TbArrowRight size={11} />} loading={isPending} onClick={() => applySingle.mutate(row)}>
                Update
              </Button>
            </Tooltip>
          )}
          {canEdit && row.category === 'onlyLocal' && (
            <Tooltip label={addAsSecret ? 'Tambah sebagai secret ke envman' : 'Tambah ke envman'}>
              <Button size="compact-xs" variant="light" color="blue" leftSection={<TbPlus size={11} />} loading={isPending} onClick={() => applySingle.mutate(row)}>
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

        {expandable && (
          <TbChevronDown size={14} style={{ flexShrink: 0, opacity: 0.5, transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : undefined }} />
        )}
      </Group>

      {expanded && expandable && (
        <Box px="sm" pb="sm" pt={4} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {row.category === 'diff' && (
            <Stack gap={6} mt={6}>
              <ValueBlock label="local" value={showFullValue(row.localValue)} rawValue={row.localValue} color="blue" />
              <ValueBlock label="envman (akan diganti)" value={showFullValue(row.serverValue)} rawValue={row.serverValue} color="orange" struck />
            </Stack>
          )}
          {row.category === 'sync' && <Box mt={6}><ValueBlock label="sama di kedua sisi" value={showFullValue(row.localValue)} rawValue={row.localValue} color="teal" /></Box>}
          {row.category === 'onlyLocal' && <Box mt={6}><ValueBlock label="local (akan ditambahkan)" value={showFullValue(row.localValue)} rawValue={row.localValue} color="blue" /></Box>}
          {row.category === 'onlySrv' && <Box mt={6}><ValueBlock label="envman (belum di local)" value={showFullValue(row.serverValue)} rawValue={row.serverValue} color="orange" /></Box>}
        </Box>
      )}
    </Box>
  )
}

function ValuePill({ value, label, color, struck }: { value: string; label: string; color: string; struck?: boolean }) {
  return (
    <Box style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{label}:</Text>
      <Code fz={11} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: `var(--mantine-color-${color}-${struck ? '5' : '7'})`, textDecoration: struck ? 'line-through' : undefined, opacity: struck ? 0.7 : 1 }} title={value}>
        {value || '(kosong)'}
      </Code>
    </Box>
  )
}

function ValueBlock({ label, value, rawValue, color, struck }: { label: string; value: string; rawValue: string | undefined; color: string; struck?: boolean }) {
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
      <Box component="pre" style={{ margin: 0, padding: '8px 10px', background: 'var(--mantine-color-default-hover)', border: `1px solid var(--mantine-color-${color}-light-color)`, borderRadius: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.5, color: `var(--mantine-color-${color}-${struck ? '5' : '8'})`, textDecoration: struck ? 'line-through' : undefined, opacity: struck ? 0.75 : 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 240, overflowY: 'auto' }}>
        {value || <Text component="span" c="dimmed" fs="italic">(kosong)</Text>}
      </Box>
    </Box>
  )
}
