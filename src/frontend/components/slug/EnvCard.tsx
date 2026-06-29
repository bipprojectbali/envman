import {
  ActionIcon,
  Badge,
  Box,
  Code,
  CopyButton,
  Group,
  Menu,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { TbCheck, TbClock, TbCopy, TbDots, TbPencil, TbTrash, TbVariable } from 'react-icons/tb'
import { DeleteEnvConfirm } from '@/frontend/components/slug/DeleteEnvConfirm'
import { RenameEnvForm } from '@/frontend/components/slug/RenameEnvForm'
import { getEnvColor } from '@/frontend/lib/project-utils'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface Environment {
  id: string
  name: string
  tags: string[]
  createdAt?: string
  _count: { vars: number }
  accessRole?: 'OWNER' | 'EDITOR' | 'VIEWER' | null
}

interface Props {
  slug: string
  env: Environment
  otherEnvNames: string[]
  canEdit: boolean
  isOwner: boolean
  myRole: string
  onEditClick: (env: Environment) => void
}

export function EnvCard({ slug, env, otherEnvNames, canEdit, isOwner, myRole, onEditClick }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const color = getEnvColor(env.name)
  const varCount = env._count?.vars ?? 0

  const goTo = () => navigate({ to: '/envmanager/$slug/$env', params: { slug, env: env.name } })

  const openRenameModal = () => {
    const modalId = `rename-env-${env.name}`
    modals.open({
      modalId,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue" radius="md">
            <TbPencil size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Rename environment
          </Text>
        </Group>
      ),
      children: (
        <RenameEnvForm
          oldName={env.name}
          varCount={varCount}
          otherNames={otherEnvNames}
          onCancel={() => modals.close(modalId)}
          onConfirm={async (newName) => {
            try {
              await apiFetch(`/api/envman/projects/${slug}/environments/${env.name}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: newName }),
              })
              qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
              notifyOk(`Environment "${env.name}" di-rename jadi "${newName}"`)
              modals.close(modalId)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  const openDeleteModal = () => {
    const id = `delete-env-${env.name}`
    modals.open({
      modalId: id,
      title: (
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="red" radius="md">
            <TbTrash size={13} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            Hapus environment
          </Text>
        </Group>
      ),
      children: (
        <DeleteEnvConfirm
          name={env.name}
          varCount={varCount}
          onCancel={() => modals.close(id)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/envman/projects/${slug}/environments/${env.name}`, { method: 'DELETE' })
              qc.invalidateQueries({ queryKey: ['envman', 'project', slug] })
              notifyOk(`Environment "${env.name}" dihapus`)
              modals.close(id)
            } catch (e) {
              notifyErr(e)
            }
          }}
        />
      ),
    })
  }

  return (
    <Box
      p="sm"
      className="envman-env-card"
      role="link"
      tabIndex={0}
      aria-label={`Kelola environment ${env.name}`}
      onClick={goTo}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          goTo()
        }
      }}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
        <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={36} radius="md" variant="light" color={color} style={{ flexShrink: 0 }}>
            <TbVariable size={18} />
          </ThemeIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} mb={2} wrap="nowrap" align="center">
              <Text fw={700} size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                {env.name}
              </Text>
              {env.accessRole === null && (
                <Tooltip label="Akses kamu di-deny untuk env ini" withArrow>
                  <Badge size="xs" color="red" variant="filled" style={{ flexShrink: 0 }}>
                    DENIED
                  </Badge>
                </Tooltip>
              )}
              {env.accessRole && env.accessRole !== myRole && (
                <Tooltip label={`Akses kamu di env ini: ${env.accessRole}`} withArrow>
                  <Badge size="xs" color="grape" variant="light" style={{ flexShrink: 0 }}>
                    {env.accessRole}
                  </Badge>
                </Tooltip>
              )}
              <Badge size="xs" variant="light" color={color} style={{ flexShrink: 0 }}>
                {varCount} vars
              </Badge>
            </Group>
            {(env.tags ?? []).length > 0 && (
              <Group gap={4} mb={2} wrap="wrap">
                {(env.tags ?? []).map((t) => (
                  <Badge key={t} size="xs" variant="dot" color="grape">
                    {t}
                  </Badge>
                ))}
              </Group>
            )}
            <Group gap={4} wrap="nowrap" align="center" onClick={(ev) => ev.stopPropagation()}>
              <Code
                fz="xs"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}
              >
                {slug}:{env.name}
              </Code>
              <CopyButton value={`${slug}:${env.name}`} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Tersalin!' : 'Copy'} withArrow>
                    <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} style={{ flexShrink: 0 }} onClick={copy}>
                      {copied ? <TbCheck size={10} /> : <TbCopy size={10} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
              {env.createdAt && (
                <Tooltip label={`Dibuat ${new Date(env.createdAt).toLocaleString('id-ID')}`} withArrow>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    <TbClock size={10} style={{ verticalAlign: 'middle' }} />
                  </Text>
                </Tooltip>
              )}
            </Group>
          </Box>
        </Group>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }} onClick={(ev) => ev.stopPropagation()}>
          {canEdit && (
            <Menu position="bottom-end" withArrow shadow="md" width={180}>
              <Menu.Target>
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Aksi environment" onClick={(ev) => ev.stopPropagation()}>
                  <TbDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<TbPencil size={13} />} onClick={(ev) => { ev.stopPropagation(); onEditClick(env) }}>
                  Edit
                </Menu.Item>
                {isOwner && (
                  <>
                    <Menu.Divider />
                    <Menu.Item leftSection={<TbTrash size={13} />} color="red" onClick={(ev) => { ev.stopPropagation(); openDeleteModal() }}>
                      Hapus
                    </Menu.Item>
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
    </Box>
  )
}
