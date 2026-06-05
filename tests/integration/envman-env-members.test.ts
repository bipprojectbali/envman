import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cleanupTestData, createTestApp, createTestSession, prisma, seedTestUser } from '../helpers'

const app = createTestApp()

let ownerId: string
let editorId: string
let ownerToken: string
let editorToken: string
const projectSlug = 'em-test-proj'

const authHeader = (token: string) => ({ 'Content-Type': 'application/json', cookie: `session=${token}` })

beforeAll(async () => {
  await cleanupTestData()

  const owner = await seedTestUser('em-owner@test.com', 'pass123', 'EmOwner', 'ADMIN')
  const editor = await seedTestUser('em-editor@test.com', 'pass123', 'EmEditor', 'ADMIN')
  ownerId = owner.id
  editorId = editor.id
  ownerToken = await createTestSession(ownerId)
  editorToken = await createTestSession(editorId)

  await app.handle(
    new Request('http://localhost/api/envman/projects', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ slug: projectSlug, name: 'EM Test' }),
    }),
  )
  const project = await prisma.project.findUnique({ where: { slug: projectSlug } })
  await prisma.projectMember.create({ data: { projectId: project!.id, userId: editorId, role: 'EDITOR' } })
  await prisma.environment.create({ data: { name: 'prod', projectId: project!.id } })
  await prisma.environment.create({ data: { name: 'dev', projectId: project!.id } })
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

describe('GET /api/envman/projects/:slug/environments/:envName/members', () => {
  test('OWNER list includes both project members with inherit by default', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toBeArray()
    expect(body.members.length).toBe(2)
    const editorRow = body.members.find((m: any) => m.userId === editorId)
    expect(editorRow.envRole).toBe('inherit')
    expect(editorRow.effectiveRole).toBe('EDITOR')
  })

  test('non-OWNER cannot list env members', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/envman/projects/:slug/environments/:envName/members/:userId', () => {
  test('OWNER can deny editor on prod', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'denied' }),
      }),
    )
    expect(res.status).toBe(200)
  })

  test('editor cannot read vars in denied env', async () => {
    await prisma.envVar.create({
      data: {
        key: 'SECRET_KEY',
        value: 'secret-value',
        environmentId: (await prisma.environment.findFirst({
          where: { name: 'prod', project: { slug: projectSlug } },
        }))!.id,
      },
    })
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/vars`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('project detail filters out denied env for editor', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const envNames = body.project.environments.map((e: any) => e.name)
    expect(envNames).not.toContain('prod')
    expect(envNames).toContain('dev')
  })

  test('OWNER still sees all envs including denied', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
        headers: authHeader(ownerToken),
      }),
    )
    const body = await res.json()
    const envNames = body.project.environments.map((e: any) => e.name)
    expect(envNames).toContain('prod')
    expect(envNames).toContain('dev')
  })

  test('non-OWNER cannot mutate env member', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(editorToken),
        body: JSON.stringify({ role: 'OWNER' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  test('invalid role rejected', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'SUPERHERO' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  test('cannot demote last owner in env', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/dev/members/${ownerId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'denied' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/envman/projects/:slug/environments/:envName/members/:userId', () => {
  test('OWNER can clear override (back to inherit)', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${editorId}`, {
        method: 'DELETE',
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)

    // editor should now see prod again (inherits EDITOR)
    const proj = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}`, {
        headers: authHeader(editorToken),
      }),
    )
    const body = await proj.json()
    const envNames = body.project.environments.map((e: any) => e.name)
    expect(envNames).toContain('prod')
  })
})

describe('Alias requiresEnvs + resolve guard', () => {
  test('alias list includes requiresEnvs parsed from args', async () => {
    // Re-deny editor for prod
    await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/environments/prod/members/${editorId}`, {
        method: 'PUT',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ role: 'denied' }),
      }),
    )

    // Create alias that references prod
    const createRes = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
        method: 'POST',
        headers: authHeader(ownerToken),
        body: JSON.stringify({ name: 'deploy', args: `-e ${projectSlug}:prod -- bash deploy.sh` }),
      }),
    )
    expect(createRes.status).toBe(200)

    // Editor lists aliases
    const listRes = await app.handle(
      new Request(`http://localhost/api/envman/projects/${projectSlug}/aliases`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(listRes.status).toBe(200)
    const body = await listRes.json()
    const deploy = body.aliases.find((a: any) => a.name === 'deploy')
    expect(deploy.requiresEnvs).toEqual([{ project: projectSlug, env: 'prod' }])
    expect(deploy.deniedEnvs).toEqual([{ project: projectSlug, env: 'prod' }])
  })

  test('resolve returns 403 with deniedEnvs for editor', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/aliases/resolve/${projectSlug}:deploy`, {
        headers: authHeader(editorToken),
      }),
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.deniedEnvs).toEqual([{ project: projectSlug, env: 'prod' }])
  })

  test('resolve OK for owner', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/envman/aliases/resolve/${projectSlug}:deploy`, {
        headers: authHeader(ownerToken),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.args).toContain('-e ')
  })
})
