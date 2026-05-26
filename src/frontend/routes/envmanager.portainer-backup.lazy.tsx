import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createLazyFileRoute('/envmanager/portainer-backup')({
  component: PortainerBackupRedirect,
})

function PortainerBackupRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: '/envmanager/connections', search: { tab: 'backup' }, replace: true })
  }, [navigate])
  return null
}
