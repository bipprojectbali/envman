import { Box, Text, UnstyledButton } from '@mantine/core'

export interface BottomTab {
  label: string
  icon: React.ComponentType<{ size?: number }>
  href: string
  active: boolean
}

interface Props {
  tabs: BottomTab[]
  navigate: (opts: { to: string }) => void
  onClose: () => void
}

export function MobileTabBar({ tabs, navigate, onClose }: Props) {
  return (
    <Box
      hiddenFrom="sm"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'var(--mantine-color-body)',
        borderTop: '1px solid var(--mantine-color-default-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'flex',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
      }}
    >
      {tabs.map((tab) => (
        <UnstyledButton
          key={tab.href}
          onClick={() => {
            navigate({ to: tab.href })
            onClose()
          }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '8px 4px',
            minHeight: 58,
            color: tab.active ? 'var(--mantine-color-primary)' : 'var(--mantine-color-dimmed)',
            position: 'relative',
            transition: 'color 0.15s',
          }}
        >
          {tab.active && (
            <Box
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 32,
                height: 3,
                borderRadius: '0 0 4px 4px',
                background: 'linear-gradient(90deg, var(--mantine-color-primary), var(--mantine-color-grape-5))',
              }}
            />
          )}
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: tab.active ? '4px 10px' : '4px',
              borderRadius: 12,
              background: tab.active
                ? 'linear-gradient(135deg, var(--mantine-color-violet-light), var(--mantine-color-grape-light))'
                : undefined,
              transition: 'all 0.15s',
            }}
          >
            <tab.icon size={20} />
          </Box>
          <Text size="xs" fw={tab.active ? 700 : 500} lh={1} style={{ fontSize: 10 }}>
            {tab.label}
          </Text>
        </UnstyledButton>
      ))}
    </Box>
  )
}
