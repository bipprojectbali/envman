import { Avatar } from '@mantine/core'
import type { AvatarProps } from '@mantine/core'

interface UserAvatarUser {
  id: string
  name: string
  image?: string | null
}

interface UserAvatarProps extends Omit<AvatarProps, 'src' | 'children'> {
  user: UserAvatarUser
}

/**
 * Avatar yang otomatis pakai foto Google jika tersedia.
 * Fetch via /api/user/avatar/:id (proxy server-side) untuk hindari CORS.
 * Fallback otomatis ke initial huruf jika gambar gagal dimuat.
 */
export function UserAvatar({ user, radius = 'xl', ...props }: UserAvatarProps) {
  const initial = user.name?.charAt(0).toUpperCase() ?? '?'
  const src = user.image ? `/api/user/avatar/${user.id}` : undefined

  return (
    <Avatar src={src} radius={radius} {...props}>
      {initial}
    </Avatar>
  )
}
