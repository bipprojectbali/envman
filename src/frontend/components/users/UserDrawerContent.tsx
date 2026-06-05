import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  CopyButton,
  Divider,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { TbBan, TbCheck, TbCopy, TbKey, TbShieldCheck, TbUser } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { apiFetch } from '@/frontend/lib/api'
import { AccessMatrixTab } from './AccessMatrixTab'
import { PermissionsTab } from './PermissionsTab'
import { ProfileTab } from './ProfileTab'
import type { UserAccess } from './types'
import { GLOBAL_ROLE_COLOR } from './types'

export function UserDrawerContent({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<UserAccess>({
    queryKey: ['admin', 'envman-users', userId, 'access'],
    queryFn: () => apiFetch(`/api/envman/admin/users/${userId}/access`),
  })

  if (isLoading || !data) {
    return (
      <Stack gap="md">
        <Box
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <Skeleton height={4} radius={0} />
          <Box p="md">
            <Group gap="md">
              <Skeleton circle height={56} width={56} />
              <Box style={{ flex: 1 }}>
                <Skeleton height={14} width="40%" mb={8} radius="sm" />
                <Skeleton height={10} width="55%" mb={8} radius="sm" />
                <Skeleton height={20} width={70} radius="xl" />
              </Box>
            </Group>
          </Box>
          <Divider />
          <SimpleGrid cols={3} p="sm">
            {[1, 2, 3].map((i) => (
              <Stack key={i} gap={4} align="center" py="xs">
                <Skeleton circle height={28} width={28} />
                <Skeleton height={18} width={32} radius="sm" />
                <Skeleton height={9} width={56} radius="sm" />
              </Stack>
            ))}
          </SimpleGrid>
        </Box>
        <Box
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
          }}
          p="md"
        >
          <Skeleton height={28} radius="md" mb="md" />
          <Stack gap="sm">
            <Skeleton height={90} radius="md" />
            <Skeleton height={90} radius="md" />
          </Stack>
        </Box>
      </Stack>
    )
  }

  const { user, projects } = data
  // Count projects user can actually touch: punya project role, atau punya env-override non-deny.
  const accessibleProjects = projects.filter(
    (p) => p.projectRole !== null || p.environments.some((e) => e.envRole !== 'inherit' && e.envRole !== 'denied'),
  ).length
  const envOverrides = projects.reduce(
    (sum, p) => sum + p.environments.filter((e) => e.envRole !== 'inherit').length,
    0,
  )
  const permissionCount = user.permissions.length
  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const isUserOnly = user.role === 'USER'
  const isBlocked = user.blocked
  const roleColor = GLOBAL_ROLE_COLOR[user.role]

  return (
    <Stack gap="md">
      {/* Header card */}
      <Box
        style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <Box p="md">
          <Group gap="md" wrap="nowrap">
            <Box style={{ position: 'relative', flexShrink: 0 }}>
              <UserAvatar
                user={user}
                size={56}
                color={roleColor}
                variant="gradient"
                gradient={{ from: roleColor, to: 'grape' }}
              />
              {user.blocked && (
                <Box
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: 'var(--mantine-color-red-6)',
                    borderRadius: '50%',
                    width: 18,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid var(--mantine-color-body)',
                  }}
                >
                  <TbBan size={10} color="white" />
                </Box>
              )}
            </Box>
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Text fw={700} size="md" truncate mb={2}>
                {user.name}
              </Text>
              <Group gap={4} mb={8}>
                <Text size="xs" c="dimmed" truncate style={{ maxWidth: 240 }}>
                  {user.email}
                </Text>
                <CopyButton value={user.email}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Disalin' : 'Copy email'} withArrow>
                      <ActionIcon size="xs" variant="subtle" color="gray" onClick={copy}>
                        {copied ? <TbCheck size={10} /> : <TbCopy size={10} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
              <Group gap={6}>
                <Badge size="sm" color={roleColor} variant="filled">
                  {user.role}
                </Badge>
                {user.blocked && (
                  <Badge size="xs" color="red" variant="light" leftSection={<TbBan size={9} />}>
                    Blocked
                  </Badge>
                )}
                {isSuperAdmin && (
                  <Badge size="xs" color="violet" variant="dot">
                    bypass all
                  </Badge>
                )}
              </Group>
            </Box>
          </Group>
        </Box>

        <Divider />
        <Group grow p="sm" gap="xs" style={isBlocked ? { opacity: 0.55, filter: 'grayscale(0.4)' } : undefined}>
          {[
            {
              value: accessibleProjects,
              label: 'Projects',
              color: isBlocked ? 'gray' : accessibleProjects > 0 ? 'violet' : 'gray',
            },
            {
              value: envOverrides,
              label: 'Overrides',
              color: isBlocked ? 'gray' : envOverrides > 0 ? 'orange' : 'gray',
            },
            {
              value: isSuperAdmin ? '∞' : permissionCount,
              label: 'Capabilities',
              color: isBlocked ? 'gray' : isSuperAdmin ? 'violet' : permissionCount > 0 ? 'teal' : 'gray',
            },
          ].map((s) => (
            <Stack key={s.label} gap={2} align="center">
              <Text size="xl" fw={800} lh={1} c={s.color}>
                {s.value}
              </Text>
              <Text size="xs" c="dimmed">
                {s.label}
              </Text>
            </Stack>
          ))}
        </Group>
      </Box>

      {/* Tabs */}
      <Tabs defaultValue="profile" variant="pills" color={roleColor}>
        <Tabs.List>
          <Tabs.Tab value="profile" leftSection={<TbUser size={14} />}>
            Profile
          </Tabs.Tab>
          {!isUserOnly && (
            <Tabs.Tab value="access" leftSection={<TbShieldCheck size={14} />}>
              <Group gap={4} wrap="nowrap">
                Access Matrix
                {accessibleProjects > 0 && (
                  <Badge size="xs" color="violet" variant="filled" circle>
                    {accessibleProjects}
                  </Badge>
                )}
              </Group>
            </Tabs.Tab>
          )}
          {!isUserOnly && (
            <Tabs.Tab value="permissions" leftSection={<TbKey size={14} />}>
              <Group gap={4} wrap="nowrap">
                Permissions
                {!isSuperAdmin && permissionCount > 0 && (
                  <Badge size="xs" color="teal" variant="filled" circle>
                    {permissionCount}
                  </Badge>
                )}
              </Group>
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="profile" pt="md">
          <ProfileTab user={user} />
        </Tabs.Panel>
        {!isUserOnly && (
          <Tabs.Panel value="access" pt="md">
            {isBlocked && (
              <Alert color="red" variant="light" icon={<TbBan size={16} />} title="User diblokir" mb="sm">
                Perubahan akses tetap tersimpan, tapi user ini tidak bisa login. Token aktifnya sudah di-disable saat
                block.
              </Alert>
            )}
            <AccessMatrixTab userId={userId} projects={projects} />
          </Tabs.Panel>
        )}
        {!isUserOnly && (
          <Tabs.Panel value="permissions" pt="md">
            {isBlocked && (
              <Alert color="red" variant="light" icon={<TbBan size={16} />} title="User diblokir" mb="sm">
                Permission tetap bisa di-grant, tapi tidak akan efektif sampai user di-unblock.
              </Alert>
            )}
            <PermissionsTab user={user} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  )
}
