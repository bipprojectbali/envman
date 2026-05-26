import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/gists/$id/files/$filename')({
  component: () => null,
})
