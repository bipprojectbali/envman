import { Badge, Box, Button, Code, CopyButton, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { TbCheck, TbCopy, TbKey, TbRefresh } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

type TokenResp = { token: string; expiresInSeconds: number }

export function GenerateTokenSection() {
  const [tokenResp, setTokenResp] = useState<TokenResp | null>(null)
  const [remaining, setRemaining] = useState(0)

  const mutation = useMutation({
    mutationFn: () => apiFetch('/api/envman/database/sync-token', { method: 'POST' }) as Promise<TokenResp>,
    onSuccess: (data) => {
      setTokenResp(data)
      setRemaining(data.expiresInSeconds)
      notifyOk('Token dibuat. Copy & paste di local dev sebelum kedaluwarsa.')
    },
    onError: (e) => notifyErr(e),
  })

  useEffect(() => {
    if (!tokenResp) return
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setTokenResp(null)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [tokenResp])

  return (
    <Box p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon size={28} variant="light" color="primary" radius="md">
            <TbKey size={14} />
          </ThemeIcon>
          <Text fw={600}>Generate Sync Token</Text>
          <Badge size="xs" color="gray" variant="light">
            jalankan di STAGING
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Token berlaku 5 menit dan hanya bisa dipakai sekali. Setelah generate, copy dan paste di section "Sync From
          Remote" pada local dev.
        </Text>
        {tokenResp ? (
          <Box
            p="sm"
            bg="var(--mantine-color-default-hover)"
            style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
          >
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Code style={{ flex: 1, wordBreak: 'break-all' }}>{tokenResp.token}</Code>
                <CopyButton value={tokenResp.token}>
                  {({ copied, copy }) => (
                    <Button
                      size="xs"
                      variant={copied ? 'filled' : 'light'}
                      color={copied ? 'teal' : 'violet'}
                      leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                      onClick={copy}
                    >
                      {copied ? 'Disalin' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <Text size="xs" c={remaining < 30 ? 'red' : 'dimmed'}>
                Kedaluwarsa dalam {Math.floor(remaining / 60)}m {remaining % 60}s
              </Text>
            </Stack>
          </Box>
        ) : (
          <Button
            leftSection={<TbRefresh size={16} />}
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            variant="light"
            color="primary"
            w="fit-content"
          >
            Generate Token
          </Button>
        )}
      </Stack>
    </Box>
  )
}
