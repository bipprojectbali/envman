import { Group, Text } from '@mantine/core'

// Arti simbol tombol role di tiap cell matrix. Ditampilkan sekali (bukan per-cell)
// agar tabel bersih — menggantikan badge role yang dulu ada di setiap sel.
const ITEMS: { short: string; label: string; color: string }[] = [
  { short: '~', label: 'Inherit', color: 'gray' },
  { short: 'V', label: 'Viewer', color: 'gray' },
  { short: 'E', label: 'Editor', color: 'teal' },
  { short: 'O', label: 'Owner', color: 'blue' },
  { short: '✕', label: 'Denied', color: 'red' },
]

export function MatrixLegend() {
  return (
    <Group gap="md" wrap="wrap">
      {ITEMS.map((it) => (
        <Group key={it.short} gap={5} wrap="nowrap">
          <Text span size="xs" fw={700} c={it.color} style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
            {it.short}
          </Text>
          <Text span size="xs" c="dimmed">
            {it.label}
          </Text>
        </Group>
      ))}
    </Group>
  )
}
