import {
  Badge,
  Box,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  TbArrowDownRight,
  TbArrowUpRight,
} from 'react-icons/tb'
import type { ComponentType } from 'react'
export { OverviewPanel, RecentActivityTable } from './DashboardStats'

export function AnalyticsPanel() {
  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={3}>Analytics</Title>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {[
            { label: 'Page Views', value: '24,521', diff: 12 },
            { label: 'Bounce Rate', value: '32.4%', diff: -3 },
            { label: 'Avg. Session', value: '4m 23s', diff: 8 },
          ].map((stat) => (
            <Box
              key={stat.label}
              p="lg"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                {stat.label}
              </Text>
              <Text fw={700} size="xl" mt={4}>
                {stat.value}
              </Text>
              <Group gap={4} mt={4}>
                {stat.diff > 0 ? (
                  <TbArrowUpRight size={14} color="var(--mantine-color-teal-6)" />
                ) : (
                  <TbArrowDownRight size={14} color="var(--mantine-color-red-6)" />
                )}
                <Text size="xs" c={stat.diff > 0 ? 'teal' : 'red'} fw={500}>
                  {Math.abs(stat.diff)}%
                </Text>
              </Group>
            </Box>
          ))}
        </SimpleGrid>

        <Box
          p="lg"
          style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
        >
          <Text fw={600} mb="md">
            Top Pages
          </Text>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Page</Table.Th>
                <Table.Th ta="right">Views</Table.Th>
                <Table.Th ta="right">Unique</Table.Th>
                <Table.Th ta="right">Bounce</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[
                { page: '/home', views: '8,234', unique: '5,120', bounce: '28%' },
                { page: '/products', views: '5,678', unique: '3,456', bounce: '35%' },
                { page: '/pricing', views: '3,912', unique: '2,890', bounce: '22%' },
                { page: '/about', views: '2,345', unique: '1,780', bounce: '41%' },
                { page: '/contact', views: '1,567', unique: '1,230', bounce: '38%' },
              ].map((row) => (
                <Table.Tr key={row.page}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {row.page}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{row.views}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{row.unique}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{row.bounce}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      </Stack>
    </Container>
  )
}

const orderStatusColor: Record<string, string> = {
  Completed: 'green',
  Processing: 'blue',
  Pending: 'yellow',
  Cancelled: 'red',
}

const ordersData = [
  { id: '#ORD-001', customer: 'Budi Santoso', amount: 'Rp 1.250.000', status: 'Completed', date: '2 jam lalu' },
  { id: '#ORD-002', customer: 'Siti Rahayu', amount: 'Rp 890.000', status: 'Processing', date: '4 jam lalu' },
  { id: '#ORD-003', customer: 'Andi Pratama', amount: 'Rp 2.100.000', status: 'Pending', date: '6 jam lalu' },
  { id: '#ORD-004', customer: 'Dewi Lestari', amount: 'Rp 560.000', status: 'Completed', date: '1 hari lalu' },
  { id: '#ORD-005', customer: 'Reza Mahendra', amount: 'Rp 1.780.000', status: 'Cancelled', date: '1 hari lalu' },
  { id: '#ORD-006', customer: 'Putri Ayu', amount: 'Rp 3.400.000', status: 'Completed', date: '2 hari lalu' },
  { id: '#ORD-007', customer: 'Hendra Wijaya', amount: 'Rp 720.000', status: 'Processing', date: '2 hari lalu' },
]

export function OrdersPanel() {
  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={3}>Orders</Title>
          <Badge variant="light" size="lg">
            {ordersData.length} orders
          </Badge>
        </Group>

        <Box
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-default-border)',
            overflow: 'hidden',
          }}
        >
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Order ID</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Date</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ordersData.map((order) => (
                <Table.Tr key={order.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {order.id}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{order.customer}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {order.amount}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={orderStatusColor[order.status]} variant="light" size="sm">
                      {order.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c="dimmed">
                      {order.date}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      </Stack>
    </Container>
  )
}


export function PlaceholderPanel({
  title,
  desc,
  icon: Icon,
}: {
  title: string
  desc: string
  icon: ComponentType<{ size: number }>
}) {
  return (
    <Container size="lg">
      <Stack align="center" justify="center" gap="md" mih={400}>
        <ThemeIcon size={64} variant="light" color="gray" radius="xl">
          <Icon size={32} />
        </ThemeIcon>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" ta="center" maw={400}>
          {desc}
        </Text>
      </Stack>
    </Container>
  )
}
