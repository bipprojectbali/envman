import { ActionIcon, Badge, Box, Code, CopyButton, Group, Stack, Text } from '@mantine/core'
import { TbCheck, TbCopy, TbEye, TbEyeOff, TbLink, TbLock, TbSquare, TbSquareCheckFilled } from 'react-icons/tb'
import { toEnvLine } from '@/frontend/lib/env-clipboard'
import { type EnvVar, relTime } from '@/frontend/types/env'
import { type EditForm, type UpdateVarInput, VarCardActionRow, VarCardEditForm } from './VarCardActions'

interface Props {
  filteredVars: EnvVar[]
  importedDisplay: EnvVar[]
  vars: EnvVar[]
  activeCount: number
  disabledCount: number
  editingId: string | null
  editForm: EditForm
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>
  updateVar: { mutate: (input: UpdateVarInput) => void; isPending: boolean }
  cancelEdit: () => void
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
  canEdit: boolean
  startEdit: (v: EnvVar) => void
  revealed: Set<string>
  toggleReveal: (id: string) => void
  showValue: (v: { id: string; isSecret: boolean }) => boolean
  toggleDisabled: { mutate: (key: string) => void; isPending: boolean; variables?: string }
  deleteVar: (key: string) => void
}

export function VarCardMobile({
  filteredVars,
  importedDisplay,
  vars,
  activeCount,
  disabledCount,
  editingId,
  editForm,
  setEditForm,
  updateVar,
  cancelEdit,
  selectedIds,
  toggleSelect,
  canEdit,
  startEdit,
  revealed,
  toggleReveal,
  showValue,
  toggleDisabled,
  deleteVar,
}: Props) {
  return (
    <Stack gap="xs">
      {filteredVars.map((v) => {
        if (editingId === v.id) {
          return (
            <VarCardEditForm
              key={v.id}
              v={v}
              editForm={editForm}
              setEditForm={setEditForm}
              updateVar={updateVar}
              cancelEdit={cancelEdit}
            />
          )
        }

        return (
          <Box
            key={v.id}
            p="sm"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: `1px solid ${selectedIds.has(v.id) ? 'var(--mantine-color-blue-4)' : 'var(--mantine-color-default-border)'}`,
              opacity: v.isDisabled ? 0.5 : 1,
              background: selectedIds.has(v.id) ? 'var(--mantine-color-blue-light)' : undefined,
              transition: 'opacity 0.15s',
            }}
          >
            <Group justify="space-between" mb={6} wrap="nowrap" gap={6}>
              <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <ActionIcon
                  size={28}
                  variant="subtle"
                  color={selectedIds.has(v.id) ? 'blue' : 'gray'}
                  onClick={() => toggleSelect(v.id)}
                  style={{ flexShrink: 0 }}
                >
                  {selectedIds.has(v.id) ? <TbSquareCheckFilled size={16} /> : <TbSquare size={16} />}
                </ActionIcon>
                <Code
                  fz="xs"
                  fw={700}
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}
                >
                  {v.key}
                </Code>
                {v.isDisabled && (
                  <Badge size="xs" variant="dot" color="orange" style={{ flexShrink: 0 }}>
                    off
                  </Badge>
                )}
                <Badge
                  size="xs"
                  color={v.isSecret ? 'red' : 'gray'}
                  variant={v.isSecret ? 'light' : 'outline'}
                  leftSection={v.isSecret ? <TbLock size={9} /> : undefined}
                  style={{ flexShrink: 0, cursor: canEdit && v.value !== '***' ? 'pointer' : undefined }}
                  onClick={() => {
                    if (!canEdit || v.value === '***') return
                    updateVar.mutate({ key: v.key, value: v.value, isSecret: !v.isSecret })
                  }}
                >
                  {v.isSecret ? 'secret' : 'plain'}
                </Badge>
              </Group>
              <Text fz={10} c="dimmed" style={{ flexShrink: 0 }}>
                {relTime(v.updatedAt)}
              </Text>
            </Group>

            <Box
              mb="xs"
              px="xs"
              py={6}
              onDoubleClick={canEdit ? () => startEdit(v) : undefined}
              title={canEdit ? 'Double-click untuk edit' : undefined}
              style={{
                background: 'var(--mantine-color-default-hover)',
                borderRadius: 6,
                minHeight: 32,
                cursor: canEdit ? 'pointer' : undefined,
              }}
            >
              {(() => {
                // Hidden by default; showValue() honors per-value reveal + the
                // global "show all plain" flag (secrets stay per-value).
                const shown = showValue(v)
                const maskable = v.value !== '' && v.value !== '***'
                return (
                  <Group gap={6} justify="space-between" wrap="nowrap">
                    <Text
                      fz="xs"
                      ff="monospace"
                      c={shown ? undefined : 'dimmed'}
                      style={{
                        letterSpacing: shown ? undefined : 3,
                        userSelect: shown ? undefined : 'none',
                        wordBreak: 'break-all',
                        flex: 1,
                      }}
                    >
                      {shown ? (
                        v.value || (
                          <Text span c="dimmed" fs="italic">
                            (kosong)
                          </Text>
                        )
                      ) : maskable ? (
                        '••••••••••'
                      ) : (
                        <Text span c="dimmed" fs="italic">
                          (kosong)
                        </Text>
                      )}
                    </Text>
                    {maskable && v.value !== '***' && (
                      <ActionIcon
                        size={28}
                        variant="subtle"
                        color={shown ? 'blue' : 'gray'}
                        onClick={() => toggleReveal(v.id)}
                        onDoubleClick={(e) => e.stopPropagation()}
                        style={{ flexShrink: 0 }}
                      >
                        {shown ? <TbEyeOff size={14} /> : <TbEye size={14} />}
                      </ActionIcon>
                    )}
                  </Group>
                )
              })()}
            </Box>

            <VarCardActionRow
              v={v}
              canEdit={canEdit}
              toggleDisabled={toggleDisabled}
              startEdit={startEdit}
              deleteVar={deleteVar}
            />
          </Box>
        )
      })}

      {importedDisplay.map((v) => (
        <Box
          key={v.id}
          p="sm"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-grape-3)',
            background: 'var(--mantine-color-grape-light)',
          }}
        >
          <Group justify="space-between" mb={6} wrap="nowrap" gap={6}>
            <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Code
                fz="xs"
                fw={700}
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
              >
                {v.key}
              </Code>
              {v.isSecret && (
                <Badge
                  size="xs"
                  color="red"
                  variant="light"
                  leftSection={<TbLock size={9} />}
                  style={{ flexShrink: 0 }}
                >
                  secret
                </Badge>
              )}
            </Group>
            <Badge size="xs" variant="light" color="grape" leftSection={<TbLink size={9} />} style={{ flexShrink: 0 }}>
              {v.source?.project}:{v.source?.env}
            </Badge>
          </Group>

          <Box
            mb="xs"
            px="xs"
            py={6}
            style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6, minHeight: 32 }}
          >
            {v.isSecret ? (
              <Group gap={6} justify="space-between" wrap="nowrap">
                <Text
                  fz="xs"
                  ff="monospace"
                  c={revealed.has(v.id) ? undefined : 'dimmed'}
                  style={{ letterSpacing: revealed.has(v.id) ? undefined : 3, userSelect: 'none', flex: 1 }}
                >
                  {revealed.has(v.id) ? v.value : '••••••••••'}
                </Text>
                {v.value !== '***' && (
                  <ActionIcon
                    size={28}
                    variant="subtle"
                    color={revealed.has(v.id) ? 'blue' : 'gray'}
                    onClick={() => toggleReveal(v.id)}
                    style={{ flexShrink: 0 }}
                  >
                    {revealed.has(v.id) ? <TbEyeOff size={14} /> : <TbEye size={14} />}
                  </ActionIcon>
                )}
              </Group>
            ) : (
              <Text fz="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {v.value || (
                  <Text span c="dimmed" fs="italic">
                    (kosong)
                  </Text>
                )}
              </Text>
            )}
          </Box>

          <Group gap={4} justify="flex-end" wrap="nowrap">
            <CopyButton value={toEnvLine(v)}>
              {({ copied, copy }) => (
                <ActionIcon size={32} variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <TbCheck size={15} /> : <TbCopy size={15} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
        </Box>
      ))}

      <Text size="xs" c="dimmed" ta="center" py="xs">
        {filteredVars.length} dari {vars.length} variabel
        {importedDisplay.length > 0 && ` · ${importedDisplay.length} imported`}
        {activeCount < vars.length && ` · ${disabledCount} disabled`}
      </Text>
    </Stack>
  )
}
