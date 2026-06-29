import { ActionIcon, Badge, Box, Code, Collapse, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { TbBan, TbChevronDown, TbChevronRight } from 'react-icons/tb'
import { ProjectAccessItem } from './ProjectAccessItem'
import type { ProjectAccess } from './types'
import { ROLE_COLOR } from './types'

function countByRole(envs: ProjectAccess['environments']) {
  let inherit = 0
  let denied = 0
  let owner = 0
  let editor = 0
  let viewer = 0
  for (const e of envs) {
    if (e.envRole === 'inherit') inherit++
    else if (e.envRole === 'denied') denied++
    else if (e.envRole === 'OWNER') owner++
    else if (e.envRole === 'EDITOR') editor++
    else if (e.envRole === 'VIEWER') viewer++
  }
  return { inherit, denied, owner, editor, viewer }
}

export function ProjectAccessRow({
  userId,
  project,
  defaultOpen = false,
}: {
  userId: string
  project: ProjectAccess
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const counts = countByRole(project.environments)
  const overrideCount = counts.denied + counts.owner + counts.editor + counts.viewer
  const roleColor = project.projectRole ? ROLE_COLOR[project.projectRole] : 'gray'

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        overflow: 'hidden',
      }}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        p="xs"
        onClick={() => setOpen((v) => !v)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <ActionIcon
          size="xs"
          variant="subtle"
          color="gray"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
        >
          {open ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
        </ActionIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={600} truncate>
              {project.name}
            </Text>
            <Code fz={9} c="dimmed">
              {project.slug}
            </Code>
          </Group>
          <Text size="xs" c="dimmed" mt={1}>
            {project.environments.length} env
            {counts.inherit > 0 && ` · ${counts.inherit} inherit`}
            {overrideCount > 0 && ` · ${overrideCount} override`}
          </Text>
        </Box>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {project.projectRole ? (
            <Badge size="xs" color={roleColor} variant="light">
              {project.projectRole}
            </Badge>
          ) : (
            <Badge size="xs" color="gray" variant="outline" leftSection={<TbBan size={9} />}>
              no role
            </Badge>
          )}
          {counts.denied > 0 && (
            <Tooltip label={`${counts.denied} env denied`} withArrow>
              <Badge size="xs" color="red" variant="filled" circle>
                {counts.denied}
              </Badge>
            </Tooltip>
          )}
          {counts.owner + counts.editor + counts.viewer > 0 && (
            <Tooltip label={`${counts.owner + counts.editor + counts.viewer} env override`} withArrow>
              <Badge size="xs" color="orange" variant="filled" circle>
                {counts.owner + counts.editor + counts.viewer}
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Group>
      <Collapse in={open}>
        <Box
          p="xs"
          style={{
            borderTop: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default-hover)',
          }}
        >
          <Stack gap="xs">
            <ProjectAccessItem userId={userId} project={project} />
          </Stack>
        </Box>
      </Collapse>
    </Box>
  )
}
