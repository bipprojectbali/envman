import { Badge, Group } from '@mantine/core'
import { Background, Controls, type Edge, MarkerType, type Node, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { LayoutSelector, useFlowAutoSave } from '../dev-flow-infra'
import { projectNodeTypes, storageKey } from './shared-node-types'

export function UserFlowView() {
  return (
    <ReactFlowProvider>
      <UserFlowViewInner />
    </ReactFlowProvider>
  )
}

function UserFlowViewInner() {
  const flow = useFlowAutoSave(storageKey('user-flow'))

  useEffect(() => {
    const p = flow.loadPos
    const n = (
      id: string,
      x: number,
      y: number,
      label: string,
      opts?: Partial<{ description: string; color: string; type: string }>,
    ): Node => ({
      id,
      type: 'flow' as const,
      position: p?.[id] ?? { x, y },
      data: { label, ...opts },
    })
    const e = (from: string, to: string, label: string, color = 'blue', sourceHandle?: string): Edge => ({
      id: `e_${from}_${to}_${label}`,
      source: from,
      target: to,
      sourceHandle,
      label,
      labelStyle: { fontSize: 9, fontFamily: 'monospace' } as const,
      style: { stroke: `var(--mantine-color-${color}-4)`, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed as const, width: 12, height: 12 },
      animated: true,
    })

    flow.setNodes([
      n('visit', 300, 0, 'User visits app', { color: 'gray' }),
      n('landing', 300, 80, '/ Landing Page', { color: 'cyan', description: 'Public' }),
      n('login', 300, 170, '/login', { color: 'cyan', description: 'Email + Google OAuth' }),
      n('auth-check', 300, 270, 'Authenticated?', { color: 'yellow', type: 'decision' }),
      n('blocked-check', 300, 370, 'Blocked?', { color: 'orange', type: 'decision' }),
      n('role-check', 300, 470, 'Role Check', { color: 'red', type: 'decision' }),
      n('dev', 100, 580, '/dev', { color: 'red', description: 'SUPER_ADMIN' }),
      n('dashboard', 300, 580, '/dashboard', { color: 'orange', description: 'ADMIN+' }),
      n('profile', 500, 580, '/profile', { color: 'blue', description: 'All users' }),
      n('blocked', 550, 370, '/blocked', { color: 'red', description: 'Logout only' }),
      n('logout', 550, 270, 'POST /api/auth/logout', { color: 'gray' }),
    ])
    flow.setEdges([
      e('visit', 'landing', 'open'),
      e('landing', 'login', 'go to login'),
      e('login', 'auth-check', 'submit'),
      e('auth-check', 'login', 'no → stay', 'gray', 'left'),
      e('auth-check', 'blocked-check', 'yes'),
      e('blocked-check', 'blocked', 'yes → blocked', 'red', 'right'),
      e('blocked-check', 'role-check', 'no'),
      e('role-check', 'dev', 'SUPER_ADMIN', 'red', 'left'),
      e('role-check', 'dashboard', 'ADMIN', 'orange'),
      e('role-check', 'profile', 'USER', 'blue', 'right'),
      e('dev', 'dashboard', 'can access', 'gray'),
      e('dashboard', 'profile', 'can access', 'gray'),
      e('blocked', 'logout', 'logout only', 'gray'),
      e('logout', 'login', 'redirect', 'gray'),
    ])
  }, [flow.loadPos, flow.setEdges, flow.setNodes])

  return (
    <>
      <Group px="md" pb="xs" gap="sm">
        <Badge size="sm" color="red" variant="light">SUPER_ADMIN → /dev</Badge>
        <Badge size="sm" color="orange" variant="light">ADMIN → /dashboard</Badge>
        <Badge size="sm" color="blue" variant="light">USER → /profile</Badge>
        <Badge size="sm" color="gray" variant="light">Blocked → /blocked</Badge>
        <LayoutSelector layoutKey={storageKey('user-flow')} onLayout={flow.relayout} />
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
