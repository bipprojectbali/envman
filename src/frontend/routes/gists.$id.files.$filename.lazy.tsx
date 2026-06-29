import { Badge, Box, Button, Container, CopyButton, Group, Skeleton, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { TbArrowLeft, TbCheck, TbCopy, TbExternalLink } from 'react-icons/tb'
import { GistFileContent } from '@/frontend/components/gists/GistFileContent'
import { GistPublicNavbar } from '@/frontend/components/gists/GistPublicNavbar'
import { GistSideFileLinks } from '@/frontend/components/gists/GistSideFileLinks'
import { type PublicGist } from '@/frontend/components/gists/GistPublicCard'
import { getLangColor } from '@/frontend/lib/languages'

export const Route = createLazyFileRoute('/gists/$id/files/$filename')({ component: FilePreviewPage })

function FilePreviewPage() {
  const { id, filename } = useParams({ from: '/gists/$id/files/$filename' })
  const navigate = useNavigate()

  const decodedFilename = decodeURIComponent(filename)
  const rawUrl = `/api/public/gists/${id}/raw/${filename}`

  const { data, isLoading, isError } = useQuery<{ gist: PublicGist }>({
    queryKey: ['public', 'gist', id],
    queryFn: () =>
      fetch(`/api/public/gists/${id}`).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
        return r.json()
      }),
  })

  const file = data?.gist.files.find((f) => f.filename === decodedFilename)
  const lineCount = file ? file.content.split('\n').length : 0

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
      <GistPublicNavbar />

      <Container size="lg" py="xl">
        <Group gap="xs" mb="md" wrap="nowrap" style={{ minWidth: 0 }}>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<TbArrowLeft size={13} />}
            onClick={() => navigate({ to: '/gists/$id', params: { id } })}
          >
            {isLoading ? '…' : (data?.gist.title ?? 'Gist')}
          </Button>
          <Text size="xs" c="dimmed">/</Text>
          <Text size="xs" fw={600} truncate>{decodedFilename}</Text>
        </Group>

        {isLoading ? (
          <Stack gap="md">
            <Skeleton height={24} width="30%" radius="md" />
            <Skeleton height={400} radius="md" />
          </Stack>
        ) : isError || !data || !file ? (
          <Box
            p="xl"
            ta="center"
            style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}
          >
            <Text size="sm" fw={500} c="red">
              {!data ? 'Gist tidak ditemukan atau bersifat private.' : `File "${decodedFilename}" tidak ditemukan.`}
            </Text>
            <Button size="xs" variant="subtle" mt="sm" onClick={() => navigate({ to: '/gists/$id', params: { id } })}>
              Kembali ke gist
            </Button>
          </Box>
        ) : (
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" style={{ minWidth: 0 }}>
                <Badge size="sm" variant="dot" color={getLangColor(file.language)}>
                  {file.language}
                </Badge>
                <Text size="xs" c="dimmed">{lineCount} lines</Text>
                <Text size="xs" c="dimmed">·</Text>
                <Text size="xs" c="dimmed">{new Blob([file.content]).size.toLocaleString()} bytes</Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                <CopyButton value={file.content} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button
                      size="xs"
                      variant="subtle"
                      color={copied ? 'teal' : 'gray'}
                      leftSection={copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
                      onClick={copy}
                    >
                      {copied ? 'Tersalin!' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<TbExternalLink size={13} />}
                  component="a"
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Raw
                </Button>
              </Group>
            </Group>

            <GistFileContent file={file} />

            <GistSideFileLinks files={data.gist.files} currentFilename={file.filename} gistId={id} />
          </Stack>
        )}
      </Container>
    </Box>
  )
}
