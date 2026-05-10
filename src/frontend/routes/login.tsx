import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import {
  TbAlertCircle,
  TbCode,
  TbKey,
  TbLock,
  TbLogin,
  TbMail,
  TbServer,
  TbShield,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useLogin } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    const error = typeof search.error === 'string' ? search.error : undefined
    return error ? { error } : {}
  },
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.ok ? r.json() : null),
      })
      if (data?.user) {
        throw redirect({ to: getDefaultRoute(data.user.role) })
      }
    } catch (e) {
      if (e instanceof Error) return
      throw e
    }
  },
  component: LoginPage,
})

const features = [
  { icon: TbShield, label: 'Encrypted at Rest', desc: 'AES-256-GCM untuk semua secret vars' },
  { icon: TbCode, label: 'Runtime Injection', desc: 'envman -e app:prod -- bun start' },
  { icon: TbUsers, label: 'Team Access Control', desc: 'Owner · Editor · Viewer per project' },
  { icon: TbServer, label: 'Self-Hosted', desc: 'Data 100% di server milikmu sendiri' },
]

const demoAccounts = [
  { label: 'Super Admin', email: 'superadmin@example.com', password: 'superadmin123', color: 'violet' },
  { label: 'Admin', email: 'admin@example.com', password: 'admin123', color: 'blue' },
  { label: 'User', email: 'user@example.com', password: 'user123', color: 'gray' },
]

function LoginPage() {
  const login = useLogin()
  const { error: searchError } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email && password) login.mutate({ email, password })
  }

  const quickLogin = (acc: typeof demoAccounts[0]) => {
    setEmail(acc.email)
    setPassword(acc.password)
    login.mutate({ email: acc.email, password: acc.password })
  }

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ─── Top bar ──────────────────────── */}
      <Group
        justify="space-between"
        px={{ base: 'md', sm: 'xl' }}
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="xs">
          <ThemeIcon size={28} variant="gradient" gradient={{ from: 'violet', to: 'grape' }} radius="md">
            <TbVariable size={14} />
          </ThemeIcon>
          <Text fw={700} size="sm">Env Manager</Text>
        </Group>
        <ThemeToggle />
      </Group>

      {/* ─── Main ─────────────────────────── */}
      <Box style={{ flex: 1, display: 'flex' }}>

        {/* Left panel — branding (hidden on mobile) */}
        <Box
          visibleFrom="md"
          style={{
            width: '45%',
            background: 'linear-gradient(145deg, var(--mantine-color-violet-9) 0%, var(--mantine-color-grape-8) 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '56px 48px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background decoration */}
          <Box
            style={{
              position: 'absolute', top: -80, right: -80,
              width: 300, height: 300, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
            }}
          />
          <Box
            style={{
              position: 'absolute', bottom: -60, left: -60,
              width: 240, height: 240, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
            }}
          />

          {/* Content */}
          <Box style={{ position: 'relative', zIndex: 1 }}>
            <ThemeIcon
              size={56}
              variant="white"
              radius="xl"
              mb="xl"
              style={{ color: 'var(--mantine-color-violet-7)' }}
            >
              <TbVariable size={28} />
            </ThemeIcon>

            <Title
              order={1}
              c="white"
              fw={800}
              mb="xs"
              style={{ fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.02em' }}
            >
              Environment variables,{' '}
              <Text component="span" c="rgba(255,255,255,0.7)" inherit>
                terkelola rapi.
              </Text>
            </Title>

            <Text c="rgba(255,255,255,0.65)" mb="xl" size="sm" lh={1.7}>
              Satu tempat untuk semua env vars tim kamu.
              Terenkripsi, ter-scope, siap inject ke runtime.
            </Text>

            <Stack gap="md">
              {features.map(f => (
                <Group key={f.label} gap="sm">
                  <ThemeIcon size={32} radius="md" variant="white" style={{ color: 'var(--mantine-color-violet-7)', flexShrink: 0 }}>
                    <f.icon size={16} />
                  </ThemeIcon>
                  <Box>
                    <Text size="sm" fw={600} c="white" lh={1.2}>{f.label}</Text>
                    <Text size="xs" c="rgba(255,255,255,0.6)">{f.desc}</Text>
                  </Box>
                </Group>
              ))}
            </Stack>
          </Box>
        </Box>

        {/* Right panel — form */}
        <Box
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(20px, 5vw, 40px) clamp(16px, 5vw, 24px)',
          }}
        >
          <Box style={{ width: '100%', maxWidth: 400 }}>

            {/* Header */}
            <Stack gap={4} mb="xl">
              <Title order={2} fw={700}>Masuk ke akun</Title>
              <Text size="sm" c="dimmed">Masukkan email dan password untuk melanjutkan</Text>
            </Stack>

            {/* Error alert */}
            {(login.isError || searchError) && (
              <Alert
                icon={<TbAlertCircle size={16} />}
                color="red"
                variant="light"
                mb="md"
                radius="md"
              >
                {login.isError
                  ? (login.error as Error).message
                  : 'Login dengan Google gagal, coba lagi.'}
              </Alert>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  placeholder="email@example.com"
                  leftSection={<TbMail size={15} />}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  required
                  size="md"
                />

                <PasswordInput
                  label="Password"
                  placeholder="Password"
                  leftSection={<TbLock size={15} />}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                  size="md"
                />

                <Button
                  type="submit"
                  fullWidth
                  size="md"
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'grape' }}
                  leftSection={<TbLogin size={17} />}
                  loading={login.isPending}
                  mt={4}
                >
                  Masuk
                </Button>
              </Stack>
            </form>

            <Divider label="atau lanjut dengan" labelPosition="center" my="lg" />

            <Button
              component="a"
              href="/api/auth/google"
              fullWidth
              size="md"
              variant="default"
              leftSection={<FcGoogle size={18} />}
            >
              Login dengan Google
            </Button>

            {/* Demo accounts */}
            <Paper
              withBorder
              p="sm"
              mt="xl"
              radius="md"
              style={{ background: 'var(--mantine-color-default-hover)' }}
            >
              <Group gap="xs" mb="sm">
                <TbKey size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" fw={600} c="dimmed">Demo accounts (development)</Text>
              </Group>
              <Group gap="xs" wrap="wrap">
                {demoAccounts.map(acc => (
                  <Tooltip
                    key={acc.label}
                    label={`${acc.email} / ${acc.password}`}
                    position="top"
                    withArrow
                  >
                    <Button
                      size="xs"
                      variant="light"
                      color={acc.color}
                      loading={login.isPending && email === acc.email}
                      onClick={() => quickLogin(acc)}
                    >
                      {acc.label}
                    </Button>
                  </Tooltip>
                ))}
              </Group>
            </Paper>

          </Box>
        </Box>
      </Box>
    </Box>
  )
}
