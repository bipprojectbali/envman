import type { ComponentProps } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { ComposeModal } from './ComposeModal'
import { ExecDrawer } from './ExecDrawer'
import { LogsModal } from './LogsModal'

type ComposeProps = ComponentProps<typeof ComposeModal>
type LogsProps = Omit<ComponentProps<typeof LogsModal>, 'isMobile'>
type ExecProps = ComponentProps<typeof ExecDrawer>

interface Props {
  compose: ComposeProps
  logs: LogsProps
  exec: ExecProps
}

export function ConnectionModals({ compose, logs, exec }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  return (
    <>
      <ComposeModal {...compose} />
      <LogsModal {...logs} isMobile={isMobile} />
      <ExecDrawer {...exec} />
    </>
  )
}
