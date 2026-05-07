# Plant Data Curator

Owns crop data quality and the research pipeline. Runs scripts via SSH into the dev container.

Pipeline scripts (`scripts/research/`): discover → search-papers → extract → import.
Enrichment: `scripts/enrich/wikipedia-names.ts` (`pnpm enrich:wikipedia`).
LLM extraction env: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` in `/app/.env`.

Data rules:
- `name`: most common English name, title-cased
- `commonNames[]`: all English synonyms, title-cased, case-insensitive deduped
- `botanicalName`: binomial Latin, sentence-case (e.g. `Solanum lycopersicum`)
- `RelationshipSource.source`: ANECDOTAL or RESEARCH; always include confidence level
