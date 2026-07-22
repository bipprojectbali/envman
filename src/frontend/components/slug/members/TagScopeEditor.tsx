import { Badge, Popover, Stack, TagsInput, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbTag } from 'react-icons/tb'

// TagScopeEditor: badge "Full"/"N tag" yang membuka Popover berisi TagsInput.
// Kosong = full access (lihat semua item). Isi = limit-by-tag (OR).
export function TagScopeEditor({
  scopeTags,
  suggestions,
  disabled,
  onSave,
}: {
  scopeTags: string[]
  suggestions: string[]
  disabled: boolean
  onSave: (tags: string[]) => void
}) {
  const [opened, setOpened] = useState(false)
  const [draft, setDraft] = useState<string[]>(scopeTags)
  const limited = scopeTags.length > 0

  // Auto-save on every change — no Save button (the suggestion dropdown could
  // cover it in the narrow popover). Each add/remove persists immediately, like
  // the role buttons. Dedupe + trim + drop empties.
  const apply = (tags: string[]) => {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
    setDraft(clean)
    onSave(clean)
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={220}
      position="bottom"
      withArrow
      trapFocus
      onOpen={() => setDraft(scopeTags)}
    >
      <Popover.Target>
        <Tooltip label={limited ? `Limit tag: ${scopeTags.join(', ')}` : 'Full access (semua item)'} withArrow fz="xs">
          <Badge
            size="xs"
            variant={limited ? 'light' : 'outline'}
            color={limited ? 'grape' : 'gray'}
            leftSection={<TbTag size={9} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpened((o) => !o)}
          >
            {limited ? `${scopeTags.length} tag` : 'Full'}
          </Badge>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Batasi akses ke item bertag tertentu. Kosongkan = full access.
          </Text>
          <TagsInput
            size="xs"
            placeholder="ketik tag lalu Enter"
            data={suggestions}
            value={draft}
            onChange={apply}
            disabled={disabled}
            clearable
            comboboxProps={{ withinPortal: true }}
          />
          <Text size="xs" c="dimmed" fz={10}>
            Perubahan tersimpan otomatis.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
