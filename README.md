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

- Docker (with Compose v2)

The host doesn't need Node, pnpm, or psql — everything lives in the dev container.

### Setup

```bash
# Clone
git clone https://github.com/your-org/power2plant.git
cd power2plant

# Configure environment
cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET (dev defaults handle the rest)

# Start the stack (Postgres + app with hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

The dev compose command runs `prisma generate`, `prisma migrate deploy`, and `next dev` on startup. Open [http://localhost:3000](http://localhost:3000).

For any project commands (tests, Prisma, db dump/restore, etc.) open a shell **inside** the dev container and run them there:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app sh

# from inside the container:
pnpm test:run                # run tests
pnpm db:migrate              # create a new migration (dev workflow)
pnpm db:restore              # load the committed seed.sql
pnpm db:import               # import fresh plant data (needs TREFLE_TOKEN)
pnpm db:dump                 # snapshot the DB to db/seed.sql
pnpm db:studio               # Prisma Studio at http://localhost:5555
```

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

Run all of these from a shell inside the dev container (`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app sh`):

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (already running via compose) |
| `pnpm build` | Production build |
| `pnpm test:run` | Run test suite (65 tests) |
| `pnpm db:migrate` | Create / apply Prisma migrations |
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

Development is covered in [Getting Started](#getting-started) — edit files in `src/` and Next.js hot reloads automatically.

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
