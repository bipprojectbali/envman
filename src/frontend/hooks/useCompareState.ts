import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import type { Category, DiffRow } from '@/frontend/lib/compare-utils'
import { notifyErr, notifyOk } from '@/frontend/lib/notify'

interface ServerVarNorm {
  value: string
  isSecret: boolean
  masked: boolean
}

interface Props {
  slug: string
  env: string
  serverVars: Record<string, ServerVarNorm>
  localText: string
  addAsSecret: boolean
}

export function useCompareState({ slug, env, serverVars, localText, addAsSecret }: Props) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | Category>('all')

  const localVars = useMemo(() => {
    const result: Record<string, string> = {}
    for (const raw of localText.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      if (!key) continue
      let value = line.slice(eq + 1)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1)
      result[key] = value
    }
    return result
  }, [localText])

  const rows: DiffRow[] = useMemo(() => {
    const keys = new Set([...Object.keys(localVars), ...Object.keys(serverVars)])
    const out: DiffRow[] = []
    for (const key of keys) {
      const local = localVars[key]
      const srv = serverVars[key]
      const inLocal = local !== undefined
      const inSrv = srv !== undefined
      if (inLocal && inSrv) {
        if (srv.masked) {
          out.push({ key, category: 'uncertain', localValue: local, isSecret: true })
        } else if (srv.value === local) {
          out.push({ key, category: 'sync', localValue: local, serverValue: srv.value, isSecret: srv.isSecret })
        } else {
          out.push({ key, category: 'diff', localValue: local, serverValue: srv.value, isSecret: srv.isSecret })
        }
      } else if (inLocal) {
        out.push({ key, category: 'onlyLocal', localValue: local, isSecret: false })
      } else {
        out.push({ key, category: 'onlySrv', serverValue: srv.value, isSecret: srv.isSecret })
      }
    }
    out.sort((a, b) => a.key.localeCompare(b.key))
    return out
  }, [localVars, serverVars])

  const counts = useMemo(() => {
    const c: Record<Category, number> = { diff: 0, onlyLocal: 0, onlySrv: 0, sync: 0, uncertain: 0 }
    for (const r of rows) c[r.category]++
    return c
  }, [rows])

  const filteredRows = filter === 'all' ? rows : rows.filter((r) => r.category === filter)

  const upsertOne = (key: string, value: string, isSecret: boolean) =>
    apiFetch(`/api/envman/projects/${slug}/environments/${env}/vars`, {
      method: 'POST',
      body: JSON.stringify({ key, value, isSecret }),
    })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['envman', 'vars', slug, env] })
    qc.invalidateQueries({ queryKey: ['envman', 'compare', slug, env] })
  }

  const applySingle = useMutation<unknown, Error, DiffRow>({
    mutationFn: (row) => upsertOne(row.key, row.localValue!, row.category === 'onlyLocal' ? addAsSecret : row.isSecret),
    onSuccess: (_, row) => { invalidate(); notifyOk(`${row.key} disinkronkan`) },
    onError: (e) => notifyErr(e),
  })

  const applyAllDiff = useMutation<number, Error, void>({
    mutationFn: async () => {
      const targets = rows.filter((r) => r.category === 'diff')
      await Promise.all(targets.map((r) => upsertOne(r.key, r.localValue!, r.isSecret)))
      return targets.length
    },
    onSuccess: (n) => { invalidate(); notifyOk(`${n} variabel di-update dari local`) },
    onError: (e) => notifyErr(e),
  })

  const applyAllMissing = useMutation<number, Error, void>({
    mutationFn: async () => {
      const targets = rows.filter((r) => r.category === 'onlyLocal')
      await Promise.all(targets.map((r) => upsertOne(r.key, r.localValue!, addAsSecret)))
      return targets.length
    },
    onSuccess: (n) => { invalidate(); notifyOk(`${n} variabel ditambahkan ke envman`) },
    onError: (e) => notifyErr(e),
  })

  const serverAsEnvText = useMemo(() => {
    return Object.entries(serverVars)
      .filter(([, v]) => !v.masked)
      .map(([k, v]) => {
        const needsQuotes = v.value.includes(' ') || v.value.includes('#') || v.value.includes('"') || v.value.includes("'")
        return needsQuotes ? `${k}="${v.value.replace(/"/g, '\\"')}"` : `${k}=${v.value}`
      })
      .join('\n')
  }, [serverVars])

  return { localVars, rows, counts, filter, setFilter, filteredRows, applySingle, applyAllDiff, applyAllMissing, serverAsEnvText }
}
