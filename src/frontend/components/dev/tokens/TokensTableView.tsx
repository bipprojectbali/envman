import { Badge, Box, Group, Stack, Table, Text, Tooltip } from '@mantine/core'
import { TbAlertTriangle, TbShieldOff, TbUsers } from 'react-icons/tb'
import { TokenActions } from './TokenAdminCard'
import { type AdminToken, STALE_DAYS, tokenStatusColor, tokenStatusLabel, tokenWarnings } from './types'

interface CommonActionProps {
  toggleDisable: (id: string, isDisabled: boolean) => void
  revoke: (t: AdminToken) => void
  revokeLoading: boolean
  toggleLoading: boolean
}

interface TokenGroup {
  userId: string
  name: string
  email: string
  tokens: AdminToken[]
}

export function TokensTableView({
  groups,
  groupByUser,
  commonActionProps,
  onExpiry,
  onActivityClick,
}: {
  groups: TokenGroup[]
  groupByUser: boolean
  commonActionProps: CommonActionProps
  onExpiry: (t: AdminToken) => void
  onActivityClick: (t: AdminToken) => void
}) {
  return (
    <Stack gap={0}>
      {groups.map((g) => (
        <Box key={g.userId || 'all'} mb={groupByUser ? 'sm' : 0}>
          {groupByUser && g.name && (
            <Group gap="xs" mb={4} mt="xs">
              <TbUsers size={14} />
              <Text size="xs" fw={600}>
                {g.name}
              </Text>
              <Text size="xs" c="dimmed">
                {g.email}
              </Text>
              <Badge size="xs" variant="light" color="gray">
                {g.tokens.length}
              </Badge>
            </Group>
          )}
          <Box style={{ overflowX: 'auto' }}>
            <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
              {!groupByUser || g === groups[0] ? (
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Owner</Table.Th>
                    <Table.Th>Token</Table.Th>
                    <Table.Th visibleFrom="sm">Scope</Table.Th>
                    <Table.Th w={60} visibleFrom="sm">
                      R/W
                    </Table.Th>
                    <Table.Th w={70}>Used</Table.Th>
                    <Table.Th w={110} visibleFrom="md">
                      Last IP
                    </Table.Th>
                    <Table.Th w={100} visibleFrom="sm">
                      Last Used
                    </Table.Th>
                    <Table.Th w={100}>Expires</Table.Th>
                    <Table.Th w={100}>Status</Table.Th>
                    <Table.Th w={100}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
              ) : null}
              <Table.Tbody>
                {g.tokens.map((t) => {
                  const w = tokenWarnings(t)
                  const rowBg = w.expired
                    ? 'var(--mantine-color-red-light)'
                    : w.expiring
                      ? 'var(--mantine-color-orange-light)'
                      : undefined
                  return (
                    <Table.Tr
                      key={t.id}
                      bg={rowBg}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onActivityClick(t)}
                    >
                      <Table.Td>
                        <Stack gap={0}>
                          <Text size="xs" fw={500}>
                            {t.user.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {t.user.email}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" ff="monospace">
                            {t.name}
                          </Text>
                          {w.wide && (
                            <Tooltip label="canWrite + scope kosong = akses penuh" withArrow>
                              <TbShieldOff size={12} color="var(--mantine-color-red-6)" />
                            </Tooltip>
                          )}
                          {w.stale && (
                            <Tooltip label={`Tidak dipakai > ${STALE_DAYS} hari`} withArrow>
                              <TbAlertTriangle size={12} color="var(--mantine-color-yellow-6)" />
                            </Tooltip>
                          )}
                          {w.expiring && (
                            <Badge size="xs" color="orange" variant="filled">
                              Expiring
                            </Badge>
                          )}
                          {w.expired && (
                            <Badge size="xs" color="red" variant="filled">
                              Expired
                            </Badge>
                          )}
                        </Group>
                        {t.disabledReason && (
                          <Text size="xs" c="dimmed" fs="italic">
                            {t.disabledReason}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td visibleFrom="sm">
                        {t.scopes.length === 0 ? (
                          <Badge size="xs" color="blue" variant="light">
                            Semua project
                          </Badge>
                        ) : (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {t.scopes.join(', ')}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="center" visibleFrom="sm">
                        {t.canWrite && (
                          <Badge size="xs" color="orange" variant="light">
                            R/W
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="xs">{t.useCount.toLocaleString()}</Text>
                      </Table.Td>
                      <Table.Td visibleFrom="md">
                        <Text size="xs" ff="monospace" c="dimmed">
                          {t.lastIp ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td visibleFrom="sm">
                        <Text size="xs" c="dimmed">
                          {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString('id-ID') : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="xs"
                          c={w.expired ? 'red' : w.expiring ? 'orange' : 'dimmed'}
                          fw={w.expired || w.expiring ? 600 : 400}
                        >
                          {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString('id-ID') : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={tokenStatusColor(t)} variant="light">
                          {tokenStatusLabel(t)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <TokenActions t={t} onExpiry={() => onExpiry(t)} {...commonActionProps} />
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
                {g.tokens.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={10}>
                      <Text c="dimmed" size="xs" ta="center" py="md">
                        Tidak ada token ditemukan.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Box>
        </Box>
      ))}
    </Stack>
  )
}
