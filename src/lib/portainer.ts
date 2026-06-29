// Inject `env_file: - stack.env` into every Docker Compose service that lacks it.
// Portainer writes Env[] to stack.env for variable substitution; without env_file in
// the service definition those vars never reach the container environment.
export function injectEnvFileIntoCompose(content: string): string {
  const lines = content.split('\n')
  const insertAfter = new Map<number, string[]>()

  let inServices = false
  let serviceIndent = -1
  let propIndent = -1
  let serviceHasEnvFile = false
  let lastPropLine = -1

  const flushService = () => {
    if (lastPropLine >= 0 && !serviceHasEnvFile && propIndent >= 0) {
      const pad = ' '.repeat(propIndent)
      insertAfter.set(lastPropLine, [`${pad}env_file:`, `${pad}  - stack.env`])
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    if (!trimmed || trimmed.startsWith('#')) continue

    if (indent === 0) {
      if (trimmed.startsWith('services:')) {
        inServices = true
        serviceIndent = -1
        propIndent = -1
      } else {
        if (inServices) {
          flushService()
          inServices = false
        }
      }
      continue
    }

    if (!inServices) continue

    if (serviceIndent === -1) serviceIndent = indent

    if (indent === serviceIndent && trimmed.endsWith(':')) {
      flushService()
      serviceHasEnvFile = false
      propIndent = -1
      lastPropLine = i
    } else if (indent > serviceIndent) {
      if (propIndent === -1) propIndent = indent
      if (trimmed.startsWith('env_file:') || trimmed === 'env_file:') serviceHasEnvFile = true
      lastPropLine = i
    }
  }

  if (inServices) flushService()

  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i])
    const extra = insertAfter.get(i)
    if (extra) result.push(...extra)
  }
  return result.join('\n')
}
