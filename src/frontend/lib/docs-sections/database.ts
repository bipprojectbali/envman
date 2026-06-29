export function buildDatabaseSection(): string {
  return `
## Database Schema

### Core Models

\`\`\`
User
├── id, name, email, password (bcrypt), role, blocked
├── createdAt, updatedAt
└── relations: sessions, apiTokens, projectMembers, gists, notes

Session
├── id, token (unique), userId, expiresAt
└── ipAddress, userAgent, createdAt

AuditLog
├── id, userId?, action, detail?, ip?
└── createdAt

Project
├── id, slug (unique), name, description?
├── deletedAt? (soft delete)
├── createdAt, updatedAt
└── relations: environments, members, portainerConfigs, notes

Environment
├── id, name, projectId
├── unique(projectId, name)
└── relations: vars[]

EnvVar
├── id, key, value, isSecret, isDisabled
├── environmentId, createdAt, updatedAt
└── unique(environmentId, key)

ProjectMember
├── id, userId, projectId, role
├── unique(userId, projectId)
└── createdAt

ApiToken
├── id, name, token (unique), userId
├── scopes[], canWrite, isDisabled
├── lastUsedAt?, expiresAt?
└── createdAt

PortainerConnection
├── id, name, portainerUrl, apiToken
├── createdById
└── createdAt, updatedAt

PortainerConfig
├── id, projectId, envName
├── connectionId? (FK ke PortainerConnection)
├── stackId, stackName, endpointId
├── lastSyncAt?, lastSyncOk?
└── unique(projectId, envName)

Ticket
├── id, title, description, status, priority
├── route?, reporterId, assigneeId?
├── createdAt, updatedAt, closedAt?
└── relations: comments[], evidence[]

Gist
├── id, userId, title, description
├── files (JSON), isPublic, tags[]
└── createdAt, updatedAt

ProjectNote
├── id, projectId, authorId
├── title, body, pinned, tags[]
└── createdAt, updatedAt
\`\`\`

### Enums

\`\`\`typescript
Role = "USER" | "QC" | "ADMIN" | "SUPER_ADMIN"
ProjectMemberRole = "OWNER" | "EDITOR" | "VIEWER"
TicketStatus = "OPEN" | "IN_PROGRESS" | "READY_FOR_QC" | "REOPENED" | "CLOSED"
TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
\`\`\`

---
`
}
