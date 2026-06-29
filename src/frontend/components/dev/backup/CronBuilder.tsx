import { Box, Chip, Code, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'

type CronFreq = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: String(i).padStart(2, '0') }))
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((i) => ({
  value: String(i),
  label: String(i).padStart(2, '0'),
}))
const DOM_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Tanggal ${i + 1}` }))
const DOW_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const VALID_MINUTES = new Set(['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'])

function detectFreq(cron: string): CronFreq {
  const p = cron.trim().split(/\s+/)
  if (p.length !== 5) return 'custom'
  const [min, hour, dom, mon, dow] = p
  if (mon !== '*') return 'custom'
  if (dom !== '*' && dow === '*' && hour !== '*') return 'monthly'
  if (dow !== '*' && dom === '*' && hour !== '*') return 'weekly'
  if (hour !== '*' && dom === '*' && dow === '*') return 'daily'
  if (min !== '*' && hour === '*' && dom === '*' && dow === '*') return 'hourly'
  return 'custom'
}

function parseCronParts(cron: string) {
  const p = cron.trim().split(/\s+/)
  return {
    min: p[0] ?? '0',
    hour: p[1] ?? '2',
    dom: p[2] ?? '1',
    dow: (p[4] ?? '*').split(',').filter((d) => /^\d$/.test(d)),
  }
}

function buildCron(freq: CronFreq, hour: string, min: string, dom: string, dow: string[]): string {
  const h = hour || '2', m = min || '0'
  switch (freq) {
    case 'hourly': return `${m} * * * *`
    case 'daily': return `${m} ${h} * * *`
    case 'weekly': return `${m} ${h} * * ${dow.length ? [...dow].sort((a, b) => +a - +b).join(',') : '*'}`
    case 'monthly': return `${m} ${h} ${dom || '1'} * *`
    default: return '0 2 * * *'
  }
}

function cronLabel(freq: CronFreq, hour: string, min: string, dom: string, dow: string[]): string {
  const t = `${String(+hour).padStart(2, '0')}:${String(+min).padStart(2, '0')}`
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  switch (freq) {
    case 'hourly': return `Tiap jam di menit :${String(+min).padStart(2, '0')}`
    case 'daily': return `Tiap hari pukul ${t}`
    case 'weekly': return `Tiap ${dow.map((d) => dayNames[+d] ?? d).join(', ')} pukul ${t}`
    case 'monthly': return `Tiap bulan tanggal ${dom} pukul ${t}`
    default: return ''
  }
}

export function CronBuilder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [freq, setFreq] = useState<CronFreq>(() => detectFreq(value))
  const initParts = parseCronParts(value)
  const [hour, setHour] = useState(initParts.hour !== '*' ? initParts.hour : '2')
  const [min, setMin] = useState(VALID_MINUTES.has(initParts.min) ? initParts.min : '0')
  const [dom, setDom] = useState(initParts.dom !== '*' ? initParts.dom : '1')
  const [dow, setDow] = useState<string[]>(initParts.dow.length ? initParts.dow : ['1'])
  const [rawCron, setRawCron] = useState(value)
  const prevValue = useRef(value)

  useEffect(() => {
    if (prevValue.current === value) return
    prevValue.current = value
    const f = detectFreq(value)
    setFreq(f)
    const p = parseCronParts(value)
    if (f !== 'custom') {
      if (p.hour !== '*') setHour(p.hour)
      setMin(VALID_MINUTES.has(p.min) ? p.min : '0')
      if (p.dom !== '*') setDom(p.dom)
      if (p.dow.length) setDow(p.dow)
    } else {
      setRawCron(value)
    }
  }, [value])

  function emit(updates: Partial<{ freq: CronFreq; hour: string; min: string; dom: string; dow: string[]; rawCron: string }>) {
    const f = updates.freq ?? freq
    const h = updates.hour ?? hour
    const m = updates.min ?? min
    const d = updates.dom ?? dom
    const dw = updates.dow ?? dow
    const rc = updates.rawCron ?? rawCron
    onChange(f === 'custom' ? rc : buildCron(f, h, m, d, dw))
  }

  const derived = freq === 'custom' ? rawCron : buildCron(freq, hour, min, dom, dow)
  const label = freq !== 'custom' ? cronLabel(freq, hour, min, dom, dow) : ''

  return (
    <Stack gap="xs">
      <Select
        label="Frekuensi backup"
        value={freq}
        onChange={(v) => { const f = (v ?? 'daily') as CronFreq; setFreq(f); emit({ freq: f }) }}
        data={[
          { value: 'hourly', label: 'Setiap jam' },
          { value: 'daily', label: 'Setiap hari' },
          { value: 'weekly', label: 'Setiap minggu' },
          { value: 'monthly', label: 'Setiap bulan' },
          { value: 'custom', label: 'Kustom (cron expression)' },
        ]}
      />
      {freq === 'hourly' && (
        <Select
          label="Di menit ke-"
          description="Backup jalan di menit ini setiap jam"
          value={min}
          onChange={(v) => { setMin(v ?? '0'); emit({ min: v ?? '0' }) }}
          data={MINUTES}
        />
      )}
      {(freq === 'daily' || freq === 'weekly' || freq === 'monthly') && (
        <Group grow gap="xs">
          <Select label="Jam" value={hour} onChange={(v) => { setHour(v ?? '2'); emit({ hour: v ?? '2' }) }} data={HOURS} />
          <Select label="Menit" value={min} onChange={(v) => { setMin(v ?? '0'); emit({ min: v ?? '0' }) }} data={MINUTES} />
        </Group>
      )}
      {freq === 'weekly' && (
        <Box>
          <Text size="sm" fw={500} mb={6}>Hari</Text>
          <Chip.Group multiple value={dow} onChange={(v) => { setDow(v); emit({ dow: v }) }}>
            <Group gap="xs">
              {DOW_LABELS.map((lbl, i) => (
                <Chip key={lbl} value={String(i)} size="sm">{lbl}</Chip>
              ))}
            </Group>
          </Chip.Group>
        </Box>
      )}
      {freq === 'monthly' && (
        <Select
          label="Tanggal"
          description="Backup jalan tiap bulan di tanggal ini"
          value={dom}
          onChange={(v) => { setDom(v ?? '1'); emit({ dom: v ?? '1' }) }}
          data={DOM_OPTIONS}
        />
      )}
      {freq === 'custom' && (
        <TextInput
          label="Cron expression"
          placeholder="0 2 * * *"
          description="Format: menit jam hari bulan hari-minggu"
          value={rawCron}
          onChange={(e) => { setRawCron(e.currentTarget.value); emit({ rawCron: e.currentTarget.value }) }}
        />
      )}
      <Group gap="xs" align="center">
        <Text size="xs" c="dimmed">Jadwal:</Text>
        <Code fz="xs">{derived}</Code>
        {label && <Text size="xs" c="dimmed">— {label}</Text>}
      </Group>
    </Stack>
  )
}
