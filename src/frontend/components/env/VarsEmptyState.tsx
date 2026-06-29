import { Box, Button, Code, Group, Text, ThemeIcon } from '@mantine/core'
import { TbFileImport, TbPlus, TbSearch, TbVariable, TbX } from 'react-icons/tb'
import type { EnvVar, FilterType } from '@/frontend/types/env'

interface Props {
  vars: EnvVar[]
  importedRows: EnvVar[]
  filteredVars: EnvVar[]
  importedDisplay: EnvVar[]
  canEdit: boolean
  setSearch: (v: string) => void
  setFilterType: (v: FilterType) => void
  setFilterDisabled: (v: 'all' | 'active' | 'disabled') => void
  openBulk: () => void
  openAdd: () => void
}

export function VarsEmptyState({
  vars,
  importedRows,
  filteredVars,
  importedDisplay,
  canEdit,
  setSearch,
  setFilterType,
  setFilterDisabled,
  openBulk,
  openAdd,
}: Props) {
  if (vars.length === 0 && importedRows.length === 0) {
    return (
      <Box
        p={{ base: 'lg', sm: 'xl' }}
        ta="center"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <ThemeIcon size={48} variant="light" color="blue" radius="xl" mx="auto" mb="md">
          <TbVariable size={24} />
        </ThemeIcon>
        <Text fw={600} size="md" mb={6}>
          Environment ini masih kosong
        </Text>
        <Text size="sm" c="dimmed" mb="lg" maw={320} mx="auto">
          Tambah variabel satu per satu atau paste dari file <Code fz="xs">.env</Code>
        </Text>
        {canEdit && (
          <Group justify="center" gap="xs">
            <Button size="sm" variant="light" leftSection={<TbFileImport size={14} />} onClick={openBulk}>
              Paste .env
            </Button>
            <Button size="sm" leftSection={<TbPlus size={14} />} onClick={openAdd}>
              Tambah Var
            </Button>
          </Group>
        )}
      </Box>
    )
  }

  if (filteredVars.length === 0 && importedDisplay.length === 0) {
    return (
      <Box
        p="xl"
        ta="center"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px dashed var(--mantine-color-default-border)',
        }}
      >
        <ThemeIcon size={44} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
          <TbSearch size={22} />
        </ThemeIcon>
        <Text size="sm" fw={500} mb={4}>
          Tidak ada hasil
        </Text>
        <Text size="xs" c="dimmed" mb="md">
          Tidak ada variabel yang cocok dengan filter saat ini.
        </Text>
        <Button
          size="xs"
          variant="subtle"
          onClick={() => {
            setSearch('')
            setFilterType('all')
            setFilterDisabled('all')
          }}
          leftSection={<TbX size={12} />}
        >
          Reset filter
        </Button>
      </Box>
    )
  }

  return null
}
