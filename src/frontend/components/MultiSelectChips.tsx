import { ActionIcon, Badge, Button, Checkbox, Group, Popover, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useMemo, useState } from 'react'
import { TbChevronDown, TbSearch, TbX } from 'react-icons/tb'

type OptionInput = { value: string; label?: string } | string

export interface MultiSelectChipsProps {
  value: string[]
  onChange: (next: string[]) => void
  options: OptionInput[]
  label?: string
  icon?: React.ReactNode
  width?: number
  size?: 'xs' | 'sm'
  searchable?: boolean
  emptyText?: string
  disabled?: boolean
}

/**
 * Compact multi-select that avoids the MultiSelect pill-wrap problem when
 * many items are selected. Trigger button shows label + count badge; the
 * dropdown is a Popover with search + checkbox list. Render selected items
 * as a separate chips row via <MultiSelectChipsRow /> for inline visibility.
 */
export function MultiSelectChips({
  value,
  onChange,
  options,
  label = 'Filter',
  icon,
  width = 140,
  size = 'xs',
  searchable = true,
  emptyText = 'Tidak ada opsi',
  disabled = false,
}: MultiSelectChipsProps) {
  const [opened, setOpened] = useState(false)
  const [search, setSearch] = useState('')

  const normalized = useMemo(
    () =>
      options.map((o) =>
        typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value },
      ),
    [options],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return normalized
    return normalized.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [normalized, search])

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        setOpened(next)
        if (!next) setSearch('')
      }}
      position="bottom-start"
      withinPortal
      shadow="md"
      width={Math.max(width, 260)}
      trapFocus
      closeOnEscape
    >
      <Popover.Target>
        <Button
          size={size}
          variant="default"
          leftSection={icon}
          disabled={disabled}
          rightSection={
            value.length > 0 ? (
              <Badge size="xs" circle variant="filled" color="primary">
                {value.length}
              </Badge>
            ) : (
              <TbChevronDown size={11} />
            )
          }
          onClick={() => setOpened((o) => !o)}
          style={{ width }}
          styles={{
            inner: { justifyContent: 'space-between' },
            label: { fontWeight: 400 },
            section: { marginRight: 0 },
          }}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap={6}>
          {searchable && normalized.length > 6 && (
            <TextInput
              size="xs"
              placeholder="Cari..."
              leftSection={<TbSearch size={12} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              data-autofocus
            />
          )}
          <ScrollArea.Autosize mah={220} type="scroll">
            <Stack gap={2}>
              {filtered.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py="xs">
                  {emptyText}
                </Text>
              )}
              {filtered.map((opt) => (
                <Checkbox
                  key={opt.value}
                  size="xs"
                  label={opt.label}
                  checked={value.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  styles={{
                    label: { fontSize: 12, cursor: 'pointer' },
                    body: { cursor: 'pointer', padding: '2px 4px', borderRadius: 4 },
                  }}
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {value.length > 0 && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<TbX size={10} />}
              onClick={() => onChange([])}
            >
              Clear semua ({value.length})
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Render selected values as removable chips. Caller controls layout. */
export function MultiSelectChipsRow({
  value,
  onChange,
  getColor,
  getLabel = (v) => v,
}: {
  value: string[]
  onChange: (next: string[]) => void
  getColor?: (v: string) => string
  getLabel?: (v: string) => string
}) {
  if (value.length === 0) return null
  return (
    <Group gap={4} wrap="wrap">
      {value.map((v) => (
        <Badge
          key={v}
          size="sm"
          variant="light"
          color={getColor?.(v) ?? 'violet'}
          pr={3}
          rightSection={
            <ActionIcon
              size={14}
              variant="transparent"
              color="inherit"
              aria-label={`Hapus filter ${getLabel(v)}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              <TbX size={10} />
            </ActionIcon>
          }
        >
          {getLabel(v)}
        </Badge>
      ))}
    </Group>
  )
}
