import { Anchor, Box, Button, Container, Group, Text, ThemeIcon } from '@mantine/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TbBook, TbLayoutDashboard, TbLogin, TbVariable } from 'react-icons/tb'
import { MarkdownRenderer } from '@/frontend/components/MarkdownRenderer'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute, useSession } from '@/frontend/hooks/useAuth'
import { buildDocsMarkdown } from '@/frontend/lib/docs-content'
import 'github-markdown-css/github-markdown.css'

export const Route = createFileRoute('/docs')({
  component: DocsPage,
})

export { buildDocsMarkdown }

function DocsPage() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const content = buildDocsMarkdown(origin)
  const { data: sessionData } = useSession()
  const user = sessionData?.user

  const ghDark = '#0d1117'
  const ghLight = '#ffffff'
  const ghBorderDark = '#30363d'
  const ghBorderLight = '#d0d7de'

  return (
    <Box style={{ minHeight: '100vh' }}>
      <style>{`
        html[data-mantine-color-scheme="light"] body { background-color: ${ghLight} !important; }
        html[data-mantine-color-scheme="dark"]  body { background-color: ${ghDark}  !important; }
      `}</style>

      <Box component="header" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
        <style>{`
          html[data-mantine-color-scheme="light"] .docs-navbar {
            background-color: ${ghLight};
            border-bottom: 1px solid ${ghBorderLight};
          }
          html[data-mantine-color-scheme="dark"] .docs-navbar {
            background-color: ${ghDark};
            border-bottom: 1px solid ${ghBorderDark};
          }
        `}</style>
        <Box className="docs-navbar">
          <Container size="lg">
            <Group h={52} justify="space-between">
              <Group gap="xs">
                <ThemeIcon size={28} variant="gradient" radius="md">
                  <TbVariable size={14} />
                </ThemeIcon>
                <Anchor component={Link} to="/" underline="never">
                  <Text fw={700} size="sm">Env Manager</Text>
                </Anchor>
                <Text c="dimmed" size="sm">/</Text>
                <Group gap={4}>
                  <TbBook size={14} />
                  <Text size="sm" fw={500}>Docs</Text>
                </Group>
              </Group>
              <Group gap="xs">
                <ThemeToggle />
                {user ? (
                  <Button
                    component={Link}
                    to={getDefaultRoute(user.role)}
                    size="xs"
                    variant="gradient"
                    leftSection={<TbLayoutDashboard size={13} />}
                  >
                    Dashboard
                  </Button>
                ) : (
                  <Button component={Link} to="/login" size="xs" variant="gradient" leftSection={<TbLogin size={13} />}>
                    Login
                  </Button>
                )}
              </Group>
            </Group>
          </Container>
        </Box>
      </Box>

      <Container size="md" py={{ base: 'lg', sm: 48 }} px={{ base: 'sm', sm: 'md' }}>
        <MarkdownRenderer>{content}</MarkdownRenderer>
      </Container>

      <style>{`
        html[data-mantine-color-scheme="light"] .docs-footer { border-top: 1px solid ${ghBorderLight}; }
        html[data-mantine-color-scheme="dark"]  .docs-footer { border-top: 1px solid ${ghBorderDark}; }
      `}</style>
      <Box className="docs-footer" py="sm">
        <Container size="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <ThemeIcon size={20} variant="gradient" radius="sm">
                <TbVariable size={10} />
              </ThemeIcon>
              <Text size="xs" fw={600}>Env Manager</Text>
            </Group>
            <Group gap="md">
              <Anchor href="/api/docs.md" size="xs" c="dimmed" target="_blank">Raw Markdown</Anchor>
              <Anchor component={Link} to="/" size="xs" c="dimmed">Landing Page</Anchor>
              <Text size="xs" c="dimmed">Self-hosted. Data tetap milikmu.</Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
