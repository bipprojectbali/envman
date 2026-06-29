import { Box, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'

export interface NavItem {
  label: string
  description?: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  href: string
  active: boolean
}

interface NavItemButtonProps {
  item: NavItem
  collapsed: boolean
  variant: 'main' | 'other' | 'extension'
  onNavigate: () => void
}

const VARIANT_STYLES = {
  main: {
    collapsedHeight: 44,
    collapsedIconSize: 18,
    iconSize: 34,
    textSize: 16,
    activeColor: 'violet' as const,
    activeCollapsedBg:
      'linear-gradient(135deg, var(--mantine-color-violet-light), var(--mantine-color-grape-light))',
    activeBg: undefined as string | undefined,
    hasDescription: true,
    hasDot: true,
    borderRadius: 10,
    padding: '10px 10px',
    minHeight: 46,
  },
  other: {
    collapsedHeight: 40,
    collapsedIconSize: 16,
    iconSize: 26,
    textSize: 13,
    activeColor: 'violet' as const,
    activeCollapsedBg: 'var(--mantine-color-violet-light)',
    activeBg: 'var(--mantine-color-violet-light)',
    hasDescription: false,
    hasDot: false,
    borderRadius: 8,
    padding: '8px 10px',
    minHeight: 38,
  },
  extension: {
    collapsedHeight: 40,
    collapsedIconSize: 16,
    iconSize: 26,
    textSize: 13,
    activeColor: 'cyan' as const,
    activeCollapsedBg: 'var(--mantine-color-cyan-light)',
    activeBg: 'var(--mantine-color-cyan-light)',
    hasDescription: true,
    hasDot: false,
    borderRadius: 8,
    padding: '8px 10px',
    minHeight: 38,
  },
}

export function NavItemButton({ item, collapsed, variant, onNavigate }: NavItemButtonProps) {
  const s = VARIANT_STYLES[variant]
  const navigate = useNavigate()

  const handleClick = () => {
    navigate({ to: item.href })
    onNavigate()
  }

  if (collapsed) {
    return (
      <Tooltip label={item.label} position="right" withArrow>
        <UnstyledButton
          onClick={handleClick}
          style={{
            width: '100%',
            height: s.collapsedHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: s.borderRadius,
            background: item.active ? s.activeCollapsedBg : undefined,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!item.active) (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
          }}
          onMouseLeave={(e) => {
            if (!item.active) (e.currentTarget as HTMLElement).style.background = ''
          }}
        >
          <item.icon
            size={s.collapsedIconSize}
            color={item.active ? `var(--mantine-color-${s.activeColor}-6)` : 'var(--mantine-color-dimmed)'}
          />
        </UnstyledButton>
      </Tooltip>
    )
  }

  return (
    <UnstyledButton
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: s.padding,
        minHeight: s.minHeight,
        borderRadius: s.borderRadius,
        background: s.activeBg && item.active ? s.activeBg : undefined,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!item.active || !s.activeBg)
          (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = s.activeBg && item.active ? s.activeBg : ''
      }}
    >
      <ThemeIcon
        size={s.iconSize}
        variant={item.active ? (variant === 'main' ? 'subtle' : 'light') : 'subtle'}
        color={item.active ? s.activeColor : 'gray'}
        radius="md"
      >
        <item.icon size={s.textSize} />
      </ThemeIcon>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text
          size="sm"
          fw={item.active ? (variant === 'main' ? 700 : 600) : 500}
          c={item.active ? s.activeColor : variant === 'main' ? undefined : 'dimmed'}
          lh={1.2}
          truncate
        >
          {item.label}
        </Text>
        {s.hasDescription && item.description && (
          <Text size="xs" c="dimmed" lh={1.2} mt={1} truncate>
            {item.description}
          </Text>
        )}
      </Box>
      {s.hasDot && item.active && (
        <Box
          style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--mantine-color-primary)' }}
        />
      )}
    </UnstyledButton>
  )
}
