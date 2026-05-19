# Contributing to IPTV Platform

## Development Setup

### Prerequisites
- Docker 24+ with NVIDIA Container Toolkit
- Python 3.11+
- Node.js 20+
- NVIDIA GPU with CUDA 12+

### Quick Start
```bash
git clone https://github.com/your-org/iptv-platform.git
cd iptv-platform
cp .env.example .env
# Edit .env with your values
docker compose up -d postgres redis
docker compose up -d backend
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `develop` | Integration branch |
| `feature/*` | New features |
| `fix/*` | Bug fixes |
| `hotfix/*` | Emergency production fixes |

## Commit Convention

```
type(scope): short description

Types: feat, fix, docs, chore, refactor, test, ci
```

Examples:
```
feat(transcoder): add H265 HEVC profile for 4K channels
fix(ingest): handle multicast reconnection on NIC failover
docs(api): update channel endpoints with EPG examples
```

## Pull Request Process

1. Fork → branch from `develop`
2. Write or update tests
3. Run `docker compose -f docker-compose.test.yml up --abort-on-container-exit`
4. Open PR against `develop`
5. Ensure CI passes (lint, test, docker build)
6. Request review from a maintainer

## Code Standards

- **Python**: Black formatter, Ruff linter, type hints required
- **JavaScript**: ESLint + Prettier
- **Docker**: Multi-stage builds, non-root user
- **No hardcoded credentials** — use `.env` variables

## Testing

```bash
# Backend unit + integration tests
cd backend && pytest -v --cov=app

# Frontend tests
cd frontend && npm run test

# Service tests
cd services/transcoder && pytest
```

## Reporting Issues

Use the GitHub issue template. Include:
- Service affected
- Reproduction steps
- Logs from `docker compose logs <service>`
- GPU info (`nvidia-smi`) if transcoder-related
