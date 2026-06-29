import { ActionIcon, Badge, Group, Select, TextInput, Tooltip } from '@mantine/core'
import { TbFilter, TbSearch, TbX } from 'react-icons/tb'

interface Props {
  search: string
  setSearch: (v: string) => void
  filterStatus: string | null
  setFilterStatus: (v: string | null) => void
  filterType: string | null
  setFilterType: (v: string | null) => void
  filterLinked: string | null
  setFilterLinked: (v: string | null) => void
  hasFilter: boolean
}

export function StackFilterToolbar({ search, setSearch, filterStatus, setFilterStatus, filterType, setFilterType, filterLinked, setFilterLinked, hasFilter }: Props) {
  const reset = () => {
    setSearch('')
    setFilterStatus(null)
    setFilterType(null)
    setFilterLinked(null)
  }

  return (
    <Group mb="sm" gap="xs" wrap="wrap">
      <TextInput
        size="xs"
        placeholder="Cari nama stack..."
        leftSection={<TbSearch size={13} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        rightSection={
          search ? (
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
              <TbX size={11} />
            </ActionIcon>
          ) : undefined
        }
        style={{ flex: 1, minWidth: 140 }}
      />
      <Select
        size="xs"
        w={120}
        placeholder="Status"
        leftSection={<TbFilter size={12} />}
        data={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        value={filterStatus}
        onChange={setFilterStatus}
        clearable
      />
      <Select
        size="xs"
        w={120}
        placeholder="Type"
        leftSection={<TbFilter size={12} />}
        data={[
          { value: 'compose', label: 'Compose' },
          { value: 'swarm', label: 'Swarm' },
        ]}
        value={filterType}
        onChange={setFilterType}
        clearable
      />
      <Select
        size="xs"
        w={130}
        placeholder="Linked envman"
        leftSection={<TbFilter size={12} />}
        data={[
          { value: 'linked', label: 'Terhubung' },
          { value: 'unlinked', label: 'Tidak terhubung' },
        ]}
        value={filterLinked}
        onChange={setFilterLinked}
        clearable
      />
      {hasFilter && (
        <Tooltip label="Reset semua filter">
          <Badge
            size="sm"
            variant="light"
            color="blue"
            rightSection={<TbX size={10} />}
            style={{ cursor: 'pointer' }}
            onClick={reset}
          >
            Reset
          </Badge>
        </Tooltip>
      )}
    </Group>
  )
}
