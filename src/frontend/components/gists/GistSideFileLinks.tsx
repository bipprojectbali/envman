import { Button, Group, Text } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'

interface Props {
  files: { filename: string }[]
  currentFilename: string
  gistId: string
}

export function GistSideFileLinks({ files, currentFilename, gistId }: Props) {
  const navigate = useNavigate()
  const others = files.filter((f) => f.filename !== currentFilename)

  if (others.length === 0) return null

  return (
    <Group gap="xs">
      <Text size="xs" c="dimmed">
        Files lain:
      </Text>
      {others.map((f) => (
        <Button
          key={f.filename}
          size="xs"
          variant="subtle"
          color="gray"
          onClick={() =>
            navigate({
              to: '/gists/$id/files/$filename',
              params: { id: gistId, filename: encodeURIComponent(f.filename) },
              search: { q: undefined, tags: undefined },
            })
          }
        >
          {f.filename}
        </Button>
      ))}
    </Group>
  )
}
