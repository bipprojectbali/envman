// CodeEditor — public-facing wrapper.
// - Lazy-load Monaco (chunk terpisah, hanya download saat dipakai)
// - Mobile fallback ke Mantine Textarea (Monaco UX di mobile = buruk)
// - Suspense boundary supaya komponen parent gak crash saat loading

import { Textarea } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { lazy, Suspense } from 'react'
import type { MonacoCodeEditorProps } from './MonacoCodeEditor'

const MonacoCodeEditor = lazy(() => import('./MonacoCodeEditor'))

export type CodeEditorProps = MonacoCodeEditorProps

export function CodeEditor(props: CodeEditorProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')

  // Mobile: fallback ke Textarea. Monaco di touch device = pengalaman tidak optimal,
  // dan extra 800KB JS gak worth load di mobile koneksi.
  if (isMobile) {
    const rows = typeof props.height === 'number' ? Math.max(8, Math.floor(props.height / 22)) : 12
    return (
      <Textarea
        value={props.value}
        onChange={(e) => props.onChange?.(e.currentTarget.value)}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        minRows={rows}
        autosize
        maxRows={rows * 2}
        styles={{
          input: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            tabSize: 2,
          },
        }}
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div
          style={{
            height: typeof props.height === 'number' ? props.height : (props.minHeight ?? 200),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--mantine-color-dimmed)',
            fontSize: 13,
            background: 'var(--mantine-color-default-hover)',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 4,
          }}
        >
          Loading code editor…
        </div>
      }
    >
      <MonacoCodeEditor {...props} />
    </Suspense>
  )
}
