export function buildCicdSection(origin: string): string {
  return `
## CI/CD — Integrasi

### GitHub Actions

\`\`\`yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install envman
        run: curl -fsSL ${origin}/install | bash

      - name: Deploy
        env:
          ENVMAN_SERVER: ${origin}
          ENVMAN_TOKEN: \${{ secrets.ENVMAN_TOKEN }}
        run: envman -e myapp:production -- bun run deploy

      - name: Run migration
        env:
          ENVMAN_SERVER: ${origin}
          ENVMAN_TOKEN: \${{ secrets.ENVMAN_TOKEN }}
        run: envman -e myapp:production -- bun run db:migrate

      - name: Upload build artifact
        env:
          ENVMAN_SERVER: ${origin}
          ENVMAN_TOKEN: \${{ secrets.ENVMAN_TOKEN }}
        run: envman storage upload myapp ./dist/app.tar.gz --path releases/\$(date +%F)-\${{ github.sha }}.tar.gz
\`\`\`

### GitLab CI

\`\`\`yaml
# .gitlab-ci.yml
variables:
  ENVMAN_SERVER: "${origin}"
  # ENVMAN_TOKEN: set di GitLab CI/CD Variables (masked)

before_script:
  - curl -fsSL ${origin}/install | bash

deploy:
  script:
    - envman -e myapp:production -- bun run deploy
    - envman storage download myapp:scripts/post-deploy.sh | bash
\`\`\`

### Docker — inject vars ke container

\`\`\`bash
# Cara 1: lewat env langsung
envman -e myapp:production -- docker run --rm \\
  -e DATABASE_URL -e REDIS_URL -e SECRET_KEY \\
  myimage:latest bun start

# Cara 2: env file sementara
envman -e myapp:production -- env > /tmp/prod.env
docker run --env-file /tmp/prod.env myimage:latest
rm /tmp/prod.env

# Cara 3: docker compose dengan override
envman storage download myapp:infra/compose.yml | \\
  docker compose -f - -e DATABASE_URL=\$DATABASE_URL up -d
\`\`\`

### Shell script automation

\`\`\`bash
#!/usr/bin/env bash
# deploy.sh — template script tanpa hardcode credentials

set -euo pipefail

# Auth dari env var (set oleh CI/CD atau .bashrc)
: "\${ENVMAN_SERVER:?set ENVMAN_SERVER}"
: "\${ENVMAN_TOKEN:?set ENVMAN_TOKEN}"

echo "Fetching latest config..."
envman storage download myapp:infra/compose.yml -o /tmp/compose.yml

echo "Pulling latest images..."
docker compose -f /tmp/compose.yml pull

echo "Restarting services..."
envman -e myapp:production -- docker compose -f /tmp/compose.yml up -d

echo "Running migrations..."
envman -e myapp:production -- bun run db:migrate

echo "Done."
\`\`\`

### Kubernetes / Helm

\`\`\`bash
# Generate env file dari server, inject ke kubectl
envman -e myapp:production -- env > .k8s.env
kubectl create secret generic myapp-secrets --from-env-file=.k8s.env --dry-run=client -o yaml | kubectl apply -f -
rm .k8s.env

# Atau lewat Helm values
envman -e myapp:production -- helm upgrade myapp ./chart \\
  --set "config.databaseUrl=\$DATABASE_URL" \\
  --set "config.redisUrl=\$REDIS_URL"
\`\`\`

---
`
}
