// Prisma where clause helper untuk filter soft-deleted records
export const notDeleted = { deletedAt: null } as const

// Soft delete helper — set deletedAt instead of hard delete
export function softDelete() {
  return { deletedAt: new Date() }
}
