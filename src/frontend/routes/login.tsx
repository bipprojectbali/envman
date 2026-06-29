import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { TbAlertCircle, TbLock, TbLogin, TbMail, TbVariable } from 'react-icons/tb'
import { LoginBrandingPanel } from '@/frontend/components/auth/LoginBrandingPanel'
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
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
      })
      if (data?.user) throw redirect({ to: getDefaultRoute(data.user.role) })
    } catch (e) {
      if (e instanceof Error) return
      throw e
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const login = useLogin()
  const { error: searchError } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email && password) login.mutate({ email, password })
  }

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" px={{ base: 'md', sm: 'xl' }} py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap="xs">
          <ThemeIcon size={28} variant="gradient" radius="md">
            <TbVariable size={14} />
          </ThemeIcon>
          <Text fw={700} size="sm">Env Manager</Text>
        </Group>
        <ThemeToggle />
      </Group>

      <Box style={{ flex: 1, display: 'flex' }}>
        <LoginBrandingPanel />

        <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(20px, 5vw, 40px) clamp(16px, 5vw, 24px)' }}>
          <Box style={{ width: '100%', maxWidth: 400 }}>
            <Stack gap={4} mb="xl">
              <Title order={2} fw={700}>Masuk ke akun</Title>
              <Text size="sm" c="dimmed">Masukkan email dan password untuk melanjutkan</Text>
            </Stack>

            {(login.isError || searchError) && (
              <Alert icon={<TbAlertCircle size={16} />} color="red" variant="light" mb="md" radius="md">
                {login.isError ? (login.error as Error).message : 'Login dengan Google gagal, coba lagi.'}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput label="Email" placeholder="email@example.com" leftSection={<TbMail size={15} />} value={email} onChange={(e) => setEmail(e.currentTarget.value)} required size="md" />
                <PasswordInput label="Password" placeholder="Password" leftSection={<TbLock size={15} />} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required size="md" />
                <Button type="submit" size="md" variant="gradient" leftSection={<TbLogin size={17} />} loading={login.isPending} mt={4}>
                  Masuk
                </Button>
              </Stack>
            </form>

            <Divider label="atau lanjut dengan" labelPosition="center" my="lg" />
            <Button fullWidth component="a" href="/api/auth/google" size="md" variant="default" leftSection={<FcGoogle size={18} />}>
              Login dengan Google
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
