# Changelog

All notable changes to this project will be documented in this file.

## [v0.15.2] - 2026-06-03

### Fixed
- UX: collapse language switcher into dropdown — all locales were shown as inline buttons cluttering the header

## [v0.15.1] - 2026-06-03

### Fixed
- Docker: set explicit `target: runner` on app service build — scripts stage added after runner caused compose to pick scripts (last stage) as default, starting a Node REPL instead of the server

## [v0.12.0] - 2026-05-20

### Added
- Landing hub with global site header and navigation (#124, #125)
- i18n infrastructure with German (de) as first locale (#118)
- i18n phase 2: `CropTranslation` table, enrichment script, locale-aware crop search
- i18n phase 3: `useTranslations` wired into remaining components
- `pnpm translate --fetch` / `--import` two-step plant name translation script
- `dev.sh` with `up`/`down`/`build`/`rebuild` commands

### Fixed
- GBIF enrichment: retry logic added, delay reduced to 200ms
- E2E smoke tests updated for new landing hub and i18n routing

## [v0.8.0] - 2026-05-05

### Changed
- Botanical green theme — warm off-white light mode and deep green-gray dark mode replacing the default shadcn monochrome palette

## [v0.7.0] - 2026-05-05

### Fixed
- Crop display names now prefer `commonNames[0]` over the technical `name` field (e.g. "Potato" instead of "Irish Potato")
- Crop names in bed cards are now consistently title-cased

### Added
- Search dropdown shows matched synonym hint when a query matches via a common name alias (e.g. search "aubergine" → shows "also: aubergine" under Eggplant)
- `pnpm enrich:wikipedia` script to enrich crop `commonNames` from Wikipedia by botanical name

## [v0.6.0] - 2026-05-05

### Added
- Browse relationships page (`/relationships`) with debounced search and cursor-based pagination
- "Browse observations" link on home page

## [v0.5.0] - 2026-05-05

### Added
- Research pipeline: LLM extraction stage using OpenAI-compatible API (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`)
- Research pipeline: import stage with confidence-weighted majority vote across conflicting papers
- 54 peer-reviewed crop relationships (45 companion, 9 avoid) backed by 93 paper sources

### Changed
- LLM extraction is now provider-agnostic (works with OpenRouter, OpenAI, Ollama, etc.)

## [v0.4.0] - 2026-05-05

### Added
- Research pipeline: paper search stage via CrossRef (primary) and Semantic Scholar (secondary)
- Research pipeline: discovery stage scraping companion planting pair candidates

## [v0.3.0] - 2026-05-05

### Added
- GitHub Actions CI: unit tests on all PRs, E2E tests on PRs targeting `main`
- CONTRIBUTING.md with branching strategy (`feat/*` → `release/vX.Y.Z` → `main`) and PR workflow

## [v0.2.0] - 2026-05-05

### Added
- Companion planting bed layout with conflict detection and spread-across-beds logic
- Crop relationship graph with COMPANION / AVOID types and confidence scores
