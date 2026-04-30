# power2plant

Companion planting recommendations for your garden beds.

Tell power2plant your growing zone and which plants you want to grow — it assigns them to beds to maximize companion planting benefits and flags incompatible pairs.

**Anonymous:** works immediately, state saved in localStorage.  
**Signed in:** zone and bed config synced to your account across devices.

## Features

- Hardiness zone detection via geolocation or map picker (Open-Meteo)
- Plant search across 66,000+ crops (Trefle, USDA, OpenFarm, PFAF, PlantBuddies)
- Companion planting relationship database (343+ relationships with confidence scores)
- Greedy affinity bed assignment algorithm
- Email/password auth via better-auth
- Offline-first: localStorage fallback when not signed in

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [Prisma 6](https://www.prisma.io/) + PostgreSQL 16
- [better-auth](https://www.better-auth.com/)
- [shadcn/ui](https://ui.shadcn.com/) (Tailwind v4, base-nova)
- [Leaflet](https://leafletjs.com/) / react-leaflet
- [Vitest 3](https://vitest.dev/)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for PostgreSQL) or a PostgreSQL 16 instance

### Setup

```bash
# Clone
git clone https://github.com/your-org/power2plant.git
cd power2plant

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and BETTER_AUTH_SECRET at minimum

# Start the database
docker compose up -d

# Run migrations
pnpm db:migrate

# (Optional) Seed plant data — requires Trefle API token in .env
pnpm db:import
# Or restore from a pre-seeded dump:
pnpm db:restore

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes (prod) | Secret for session signing (≥32 chars) |
| `BETTER_AUTH_URL` | Yes (prod) | Public URL of the app (e.g. `https://example.com`) |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Same as `BETTER_AUTH_URL`, exposed to client |
| `TREFLE_TOKEN` | For import | API token for Trefle plant database |

In development, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` fall back to safe defaults if unset.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm test:run` | Run test suite (65 tests) |
| `pnpm db:migrate` | Run pending Prisma migrations |
| `pnpm db:import` | Import plant data from all sources |
| `pnpm db:import <source>` | Import from a specific source (trefle, usda, openfarm, plantbuddies, pfaf) |
| `pnpm db:restore` | Restore pre-seeded plant database |
| `pnpm db:dump` | Dump current database to file |
| `pnpm db:studio` | Open Prisma Studio |

## Data Sources

Plant data is seeded from multiple open sources:

| Source | Data | License |
|--------|------|---------|
| [Trefle](https://trefle.io/) | Taxonomy, plant info | API (token required) |
| [USDA PLANTS](https://plants.usda.gov/) | Taxonomy supplement | Public domain |
| [OpenFarm](https://openfarm.cc/) | Companion relationships | CC BY 4.0 |
| [PFAF](https://pfaf.org/) | Companion + growing data | CC BY-NC-SA 4.0 |
| [PlantBuddies](https://github.com/Serlo/PlantBuddies) | 1,717 relationships | License TBD — contact Serlo |

> **Note:** PlantBuddies data is used as non-commercial fair use pending license clarification with [Serlo](https://github.com/Serlo). Do not use in a commercial deployment until resolved.

## Docker

### Development (hot reload)

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Edit files in `src/` — Next.js hot reloads automatically.

### Production

```bash
export BETTER_AUTH_SECRET="your-secret-here"
export BETTER_AUTH_URL="https://your-domain.com"
export NEXT_PUBLIC_APP_URL="https://your-domain.com"

docker compose up --build
```

Migrations run automatically on container start.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
