import { ActionIcon, Autocomplete, Group, Select } from '@mantine/core'
import { TbSearch, TbTag, TbX } from 'react-icons/tb'

// Toolbar filter untuk MembersMatrixView: cari anggota (baris), cari env + tag (kolom).
// Search anggota & env pakai Autocomplete — ketik bebas + saran dropdown dari data.
export function MatrixFilterBar({
  memberQuery,
  setMemberQuery,
  envQuery,
  setEnvQuery,
  envTag,
  setEnvTag,
  envTagOptions,
  memberOptions,
  envOptions,
  hasFilter,
  onReset,
}: {
  memberQuery: string
  setMemberQuery: (v: string) => void
  envQuery: string
  setEnvQuery: (v: string) => void
  envTag: string | null
  setEnvTag: (v: string | null) => void
  envTagOptions: { value: string; label: string }[]
  memberOptions: string[]
  envOptions: string[]
  hasFilter: boolean
  onReset: () => void
}) {
  return (
    <Group gap="xs" wrap="wrap">
      <Autocomplete
        size="xs"
        placeholder="Cari anggota..."
        leftSection={<TbSearch size={12} />}
        data={memberOptions}
        value={memberQuery}
        onChange={setMemberQuery}
        rightSection={
          memberQuery ? (
            <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Hapus" onClick={() => setMemberQuery('')}>
              <TbX size={10} />
            </ActionIcon>
          ) : null
        }
        w={170}
      />
      <Autocomplete
        size="xs"
        placeholder="Cari env..."
        leftSection={<TbSearch size={12} />}
        data={envOptions}
        value={envQuery}
        onChange={setEnvQuery}
        rightSection={
          envQuery ? (
            <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Hapus" onClick={() => setEnvQuery('')}>
              <TbX size={10} />
            </ActionIcon>
          ) : null
        }
        w={150}
      />
      {envTagOptions.length > 0 && (
        <Select
          size="xs"
          placeholder="Tag env"
          leftSection={<TbTag size={12} />}
          data={envTagOptions}
          value={envTag}
          onChange={setEnvTag}
          searchable
          clearable
          w={140}
        />
      )}
      {hasFilter && (
        <ActionIcon size="md" variant="subtle" color="gray" aria-label="Reset filter" onClick={onReset}>
          <TbX size={14} />
        </ActionIcon>
      )}
    </Group>
  )
}
