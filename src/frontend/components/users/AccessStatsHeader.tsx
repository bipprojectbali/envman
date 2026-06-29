import { Badge, Group, Text } from '@mantine/core'
import type { ProjectAccess } from './types'
import { ROLE_COLOR } from './types'

interface Stats {
  total: number
  withAccess: number
  noAccess: number
  ownerProjects: number
  editorProjects: number
  viewerProjects: number
  envOverrides: number
  envDenied: number
}

export function computeStats(projects: ProjectAccess[]): Stats {
  let withAccess = 0
  let ownerProjects = 0
  let editorProjects = 0
  let viewerProjects = 0
  let envOverrides = 0
  let envDenied = 0

  for (const p of projects) {
    const hasOverride = p.environments.some((e) => e.envRole !== 'inherit')
    if (p.projectRole !== null || hasOverride) withAccess++
    if (p.projectRole === 'OWNER') ownerProjects++
    else if (p.projectRole === 'EDITOR') editorProjects++
    else if (p.projectRole === 'VIEWER') viewerProjects++
    for (const e of p.environments) {
      if (e.envRole === 'denied') {
        envDenied++
        envOverrides++
      } else if (e.envRole !== 'inherit') {
        envOverrides++
      }
    }
  }

  return {
    total: projects.length,
    withAccess,
    noAccess: projects.length - withAccess,
    ownerProjects,
    editorProjects,
    viewerProjects,
    envOverrides,
    envDenied,
  }
}

export function AccessStatsHeader({ stats }: { stats: Stats }) {
  return (
    <Group gap={6} wrap="wrap">
      <Badge size="sm" variant="light" color="violet">
        {stats.withAccess} / {stats.total} projects
      </Badge>
      {stats.ownerProjects > 0 && (
        <Badge size="sm" variant="light" color={ROLE_COLOR.OWNER}>
          {stats.ownerProjects} OWNER
        </Badge>
      )}
      {stats.editorProjects > 0 && (
        <Badge size="sm" variant="light" color={ROLE_COLOR.EDITOR}>
          {stats.editorProjects} EDITOR
        </Badge>
      )}
      {stats.viewerProjects > 0 && (
        <Badge size="sm" variant="light" color={ROLE_COLOR.VIEWER}>
          {stats.viewerProjects} VIEWER
        </Badge>
      )}
      {stats.envOverrides > 0 && (
        <Badge size="sm" variant="light" color="orange">
          {stats.envOverrides} env override
          {stats.envDenied > 0 && (
            <Text component="span" size="xs" c="red" ml={4} fw={700}>
              ({stats.envDenied} denied)
            </Text>
          )}
        </Badge>
      )}
    </Group>
  )
}
