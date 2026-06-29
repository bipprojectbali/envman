import { ActionIcon, Badge, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, type Edge, MarkerType, type Node, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { TbRefresh } from 'react-icons/tb'
import { LayoutSelector, useFlowAutoSave } from '../dev-flow-infra'
import { AUTH_COLORS, METHOD_COLORS, projectNodeTypes, storageKey } from './shared-node-types'

interface RouteInfo {
  method: string
  path: string
  auth: string
  category: string
  description: string
}

interface RoutesData {
  routes: RouteInfo[]
  summary: {
    total: number
    byMethod: Record<string, number>
    byAuth: Record<string, number>
    byCategory: Record<string, number>
  }
}

export function ApiRoutesFlow() {
  return (
    <ReactFlowProvider>
      <ApiRoutesFlowInner />
    </ReactFlowProvider>
  )
}

function ApiRoutesFlowInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'routes'],
    queryFn: () => fetch('/api/admin/routes', { credentials: 'include' }).then((r) => r.json()) as Promise<RoutesData>,
  })
  const flow = useFlowAutoSave(storageKey('api-routes'))

  useEffect(() => {
    if (!data?.routes) return
    const categories = ['frontend', 'auth', 'admin', 'utility', 'realtime']
    const grouped: Record<string, RouteInfo[]> = {}
    for (const r of data.routes) {
      if (!grouped[r.category]) grouped[r.category] = []
      grouped[r.category].push(r)
    }

    const nodes: Node[] = []
    const edges: Edge[] = []
    let colX = 0

    for (const cat of categories) {
      const routes = grouped[cat]
      if (!routes) continue
      routes.forEach((r, i) => {
        const id = `${r.method}_${r.path}`
        const defaultPos = { x: colX, y: i * 80 }
        nodes.push({
          id,
          type: 'route',
          position: flow.loadPos?.[id] ?? defaultPos,
          data: r as unknown as Record<string, unknown>,
        })
      })
      colX += 300
    }

    const loginId = 'POST_/api/auth/login'
    const sessionId = 'GET_/api/auth/session'
    const googleId = 'GET_/api/auth/google'
    const callbackId = 'GET_/api/auth/callback/google'
    const logoutId = 'POST_/api/auth/logout'

    const flowEdges: [string, string, string][] = [
      ['PAGE_/login', loginId, 'email login'],
      ['PAGE_/login', googleId, 'google'],
      [googleId, callbackId, 'redirect'],
      [callbackId, 'PAGE_/dev', 'SUPER_ADMIN'],
      [callbackId, 'PAGE_/dashboard', 'ADMIN'],
      [callbackId, 'PAGE_/profile', 'USER'],
      [loginId, 'PAGE_/dev', 'SUPER_ADMIN'],
      [loginId, 'PAGE_/dashboard', 'ADMIN'],
      [loginId, 'PAGE_/profile', 'USER'],
      [logoutId, 'PAGE_/login', 'redirect'],
      [sessionId, 'PAGE_/login', '401 redirect'],
    ]

    for (const [from, to, label] of flowEdges) {
      if (nodes.find((n) => n.id === from) && nodes.find((n) => n.id === to)) {
        edges.push({
          id: `e_${from}_${to}`,
          source: from,
          target: to,
          label,
          labelStyle: { fontSize: 9, fontFamily: 'monospace' },
          style: { stroke: 'var(--mantine-color-blue-4)', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
          animated: true,
        })
      }
    }

    flow.setNodes(nodes)
    flow.setEdges(edges)
  }, [data, flow.setEdges, flow.loadPos, flow.setNodes])

  if (isLoading)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">Loading routes...</Text>
      </Stack>
    )
  if (!data)
    return (
      <Stack align="center" justify="center" mih={400}>
        <Text c="dimmed">No data</Text>
      </Stack>
    )

  return (
    <>
      <Group px="md" pb="xs" gap="sm">
        {Object.entries(data.summary.byMethod).map(([m, c]) => (
          <Badge key={m} size="sm" variant="light" color={METHOD_COLORS[m] || 'gray'}>
            {m}: {c}
          </Badge>
        ))}
        <Text size="xs" c="dimmed">|</Text>
        {Object.entries(data.summary.byAuth).map(([a, c]) => (
          <Badge key={a} size="sm" variant="dot" color={AUTH_COLORS[a] || 'gray'}>
            {a}: {c}
          </Badge>
        ))}
        <LayoutSelector layoutKey={storageKey('api-routes')} onLayout={flow.relayout} />
        <Tooltip label="Reload routes">
          <ActionIcon variant="subtle" size="sm" loading={isFetching} onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'routes'] })}>
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          onNodesChange={flow.handleNodesChange}
          onEdgesChange={flow.onEdgesChange}
          onMoveEnd={flow.handleMoveEnd}
          nodeTypes={projectNodeTypes}
          defaultViewport={flow.savedVp ?? undefined}
          fitView={!flow.savedVp}
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </>
  )
}
