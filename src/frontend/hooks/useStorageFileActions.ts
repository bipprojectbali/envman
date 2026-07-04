import { useRef, useState } from 'react'
import { apiFetch } from '@/frontend/lib/api'
import { isPreviewable, isTextFile } from '@/frontend/lib/storage-format'

interface StorageObject {
  id: string; path: string; size: number; mimeType: string
  isPublic: boolean; tags: string[]; description: string | null
}

/** Shared action logic untuk file row dan grid card — share, copy, download, drag-to-download. */
export function useStorageFileActions(file: StorageObject, slug: string) {
  const [copied, setCopied] = useState<'link' | 'content' | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Cache presigned URL ≤4 mnt (server TTL 5 mnt) untuk drag-to-download
  const presignedCache = useRef<{ url: string; at: number } | null>(null)

  async function getPresignedUrl(): Promise<string | null> {
    const res = await apiFetch<{ url: string }>(
      `/api/envman/projects/${slug}/storage/download?path=${encodeURIComponent(file.path)}`
    )
    return res?.url ?? null
  }

  /** Dipanggil onMouseEnter supaya URL sudah siap saat drag dimulai. */
  async function prefetchPresigned() {
    const now = Date.now()
    if (presignedCache.current && now - presignedCache.current.at < 240_000) return
    const url = await getPresignedUrl()
    if (url) presignedCache.current = { url, at: now }
  }

  /**
   * Drag-to-download via DownloadURL — hanya Chrome/Edge.
   * Untuk file publik, permanent URL dipakai. Untuk private, butuh presignedCache terisi dulu.
   */
  function handleDragStart(e: React.DragEvent) {
    const url = file.isPublic
      ? `${window.location.origin}/api/public/storage/${slug}/${file.path}`
      : presignedCache.current?.url
    if (!url) { e.preventDefault(); return }
    const filename = file.path.split('/').pop() ?? file.path
    e.dataTransfer.setData('DownloadURL', `${file.mimeType}:${filename}:${url}`)
    e.dataTransfer.effectAllowed = 'copy'
  }

  async function handleShare() {
    const url = file.isPublic
      ? `${window.location.origin}/api/public/storage/${slug}/${file.path}`
      : await getPresignedUrl()
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied('link')
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleCopyContent() {
    const url = await getPresignedUrl()
    if (!url) return
    const text = await fetch(url).then((r) => r.text())
    await navigator.clipboard.writeText(text)
    setCopied('content')
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleDownload() {
    const url = await getPresignedUrl()
    if (url) window.open(url, '_blank')
  }

  return {
    copied,
    previewOpen,
    setPreviewOpen,
    handleShare,
    handleCopyContent,
    handleDownload,
    handleDragStart,
    prefetchPresigned,
    canPreview: isPreviewable(file.mimeType, file.path),
    canCopy: isTextFile(file.mimeType, file.path),
  }
}
