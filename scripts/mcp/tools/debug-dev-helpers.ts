export function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

export function errText(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] }
}
