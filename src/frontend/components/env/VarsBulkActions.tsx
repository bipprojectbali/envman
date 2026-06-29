import { ActionIcon, Badge, Button, Group, Menu, Text, Tooltip } from '@mantine/core'
import {
  TbDots,
  TbFileImport,
  TbLink,
  TbLock,
  TbLockOpen,
  TbPencil,
  TbPlus,
  TbTrash,
} from 'react-icons/tb'
import type { EnvVar } from '@/frontend/types/env'

interface VarsBulkActionsProps {
  canEdit: boolean
  isOwner: boolean
  vars: EnvVar[]
  filteredVars: EnvVar[]
  selectedIds: Set<string>
  plainCount: number
  secretCount: number
  openImportMgr: () => void
  openBulk: () => void
  openEditEnvModal: () => void
  openAdd: () => void
  confirmClearAll: () => void
  confirmBulkToggle: (targetSecret: boolean) => void
}

export function VarsBulkActions({
  canEdit, isOwner, vars, filteredVars, selectedIds, plainCount, secretCount,
  openImportMgr, openBulk, openEditEnvModal, openAdd, confirmClearAll, confirmBulkToggle,
}: VarsBulkActionsProps) {
  if (!canEdit) return null

  return (
    <Group gap={4} wrap="nowrap" w="fit-content">
      {isOwner && (
        <Tooltip label="Import vars dari env lain (live-link)">
          <ActionIcon size="sm" variant="subtle" color="grape" radius="md" onClick={openImportMgr}>
            <TbLink size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      <Menu shadow="md" width={220} position="bottom-end">
        <Menu.Target>
          <Tooltip label="Import / edit .env">
            <ActionIcon size="sm" variant="subtle" color="gray" radius="md">
              <TbFileImport size={14} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>File .env</Menu.Label>
          <Menu.Item leftSection={<TbFileImport size={14} />} onClick={openBulk}>
            Paste .env
            <Text size="xs" c="dimmed">Import dari clipboard</Text>
          </Menu.Item>
          {vars.length > 0 && (
            <Menu.Item leftSection={<TbPencil size={14} />} onClick={openEditEnvModal}>
              Edit .env
              <Text size="xs" c="dimmed">Edit semua vars sekaligus</Text>
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>

      <Button size="sm" leftSection={<TbPlus size={14} />} onClick={openAdd} radius="md">
        Tambah Var
      </Button>

      {vars.length > 0 && (
        <Menu shadow="md" width={230} position="bottom-end">
          <Menu.Target>
            <Tooltip label="Lebih banyak aksi">
              <ActionIcon size="sm" variant="subtle" color="gray" radius="md">
                <TbDots size={14} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Konversi tipe</Menu.Label>
            {plainCount > 0 && (
              <Menu.Item
                leftSection={<TbLock size={14} />}
                rightSection={<Badge size="xs" variant="light" color="red">{plainCount}</Badge>}
                onClick={() => confirmBulkToggle(true)}
              >
                Semua plain → Secret
              </Menu.Item>
            )}
            {secretCount > 0 && vars.every((v) => !v.isSecret || v.value !== '***') && (
              <Menu.Item
                leftSection={<TbLockOpen size={14} />}
                rightSection={<Badge size="xs" variant="light" color="gray">{secretCount}</Badge>}
                onClick={() => confirmBulkToggle(false)}
              >
                Semua secret → Plain
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Label c="red">Zona berbahaya</Menu.Label>
            <Menu.Item
              color="red"
              leftSection={<TbTrash size={14} />}
              rightSection={<Badge size="xs" variant="light" color="red">{vars.length}</Badge>}
              onClick={confirmClearAll}
            >
              Hapus semua vars
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  )
}
