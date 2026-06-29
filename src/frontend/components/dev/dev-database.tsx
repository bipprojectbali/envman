import { ActionIcon, Badge, Container, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import '@xyflow/react/dist/style.css'
import { TbRefresh } from 'react-icons/tb'
import { getLayoutedElements, LayoutSelector } from './dev-flow-infra'
import {
  type ParsedSchema,
  STORAGE_KEY,
  VIEWPORT_KEY,
  buildSchemaGraph,
  loadViewport,
  nodeTypes,
  savePositions,
  saveViewport,
} from './DatabaseSchemaNodes'

export function DatabasePanel() {
  return (
    <ReactFlowProvider>
      <DatabasePanelInner />
    </ReactFlowProvider>
  )
}

function DatabasePanelInner() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'schema'],
    queryFn: () =>
      fetch('/api/admin/schema', { credentials: 'include' }).then((r) => r.json()) as Promise<{ schema: ParsedSchema }>,
  })

  const schema = data?.schema
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { fitView: fitViewDb } = useReactFlow()
  const savedViewport = useMemo(() => loadViewport(), [])

  const { initialNodes, initialEdges } = useMemo(
    () => (schema ? buildSchemaGraph(schema) : { initialNodes: [], initialEdges: [] }),
    [schema],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setEdges, setNodes])

  // Debounced auto-save viewport on pan/zoom
  const handleMoveEnd = useCallback((_event: any, viewport: { x: number; y: number; zoom: number }) => {
    clearTimeout(viewportTimer.current)
    viewportTimer.current = setTimeout(() => saveViewport(viewport), 500)
  }, [])

  // Debounced auto-save on node drag
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        // Read latest nodes from DOM via setNodes callback
        setNodes((current) => {
          savePositions(current)
          return current
        })
      }, 500)
    },
    [
      onNodesChange, // Read latest nodes from DOM via setNodes callback
      setNodes,
    ],
  )

  if (isLoading) {
    return (
      <Container size="lg">
        <Stack align="center" justify="center" mih={400}>
          <Text c="dimmed">Loading schema...</Text>
        </Stack>
      </Container>
    )
  }

  if (!schema) {
    return (
      <Container size="lg">
        <Stack align="center" justify="center" mih={400}>
          <Text c="dimmed">Schema not found</Text>
        </Stack>
      </Container>
    )
  }

  return (
    <Stack gap={0} h="calc(100vh - 32px)">
      <Group justify="space-between" px="md" py="xs">
        <Group gap="sm">
          <Title order={3}>Database Schema</Title>
          <Badge variant="light" size="sm">
            {schema.models.length} models
          </Badge>
          <Badge variant="light" color="primary" size="sm">
            {schema.enums.length} enums
          </Badge>
          <Badge variant="light" color="blue" size="sm">
            {schema.relations.length} relations
          </Badge>
        </Group>
        <LayoutSelector
          layoutKey={STORAGE_KEY}
          onLayout={(layout) => {
            getLayoutedElements(nodes, edges, layout).then(({ nodes: laid }) => {
              setNodes(laid)
              localStorage.removeItem(STORAGE_KEY)
              localStorage.removeItem(VIEWPORT_KEY)
              const pos: Record<string, { x: number; y: number }> = {}
              for (const n of laid) pos[n.id] = n.position
              localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
              requestAnimationFrame(() => fitViewDb({ padding: 0.2 }))
            })
          }}
        />
        <Tooltip label="Reload schema">
          <ActionIcon
            variant="subtle"
            size="sm"
            loading={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'schema'] })}
          >
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onMoveEnd={handleMoveEnd}
          nodeTypes={nodeTypes}
          defaultViewport={savedViewport ?? undefined}
          fitView={!savedViewport}
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </Stack>
  )
}
