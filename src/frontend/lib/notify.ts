import { notifications } from '@mantine/notifications'

export function notifyOk(message: string, title?: string) {
  notifications.show({
    color: 'teal',
    title: title ?? 'Berhasil',
    message,
    autoClose: 3000,
  })
}

export function notifyErr(error: unknown, fallback = 'Terjadi kesalahan') {
  const message = error instanceof Error ? error.message : fallback
  notifications.show({
    color: 'red',
    title: 'Error',
    message,
    autoClose: 5000,
  })
}
