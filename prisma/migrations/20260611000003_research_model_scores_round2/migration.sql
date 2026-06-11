-- Update ResearchModel scores based on benchmark round 2 (:online models with web search)
-- Methodology: real citation (DOI HTTP 200/403), notes specificity, JSON format compliance

UPDATE "ResearchModel" SET "score" = 88, "notes" = 'Round 2: real DOI (200), good notes, fastest response'
  WHERE "id" = 'openai/o3:online';

UPDATE "ResearchModel" SET "score" = 85, "notes" = 'Round 2: best citation quality (PMC 200), most specific notes (mechanism %, pathways), 0.92 confidence'
  WHERE "id" = 'anthropic/claude-sonnet-4-6:online';

UPDATE "ResearchModel" SET "score" = 78, "notes" = 'Round 2: real PMC DOI (200), solid notes, fast and cost-effective'
  WHERE "id" = 'google/gemini-2.5-flash:online';

UPDATE "ResearchModel" SET "score" = 72, "notes" = 'Round 2: real DOI but paywalled (403), generic notes'
  WHERE "id" = 'openai/gpt-4o:online';

UPDATE "ResearchModel" SET "score" = 50, "notes" = 'Round 2: ignored JSON-only instruction, returned prose — unreliable for automated pipeline'
  WHERE "id" = 'google/gemini-2.5-pro:online';

UPDATE "ResearchModel" SET "score" = 45, "notes" = 'Round 2: ignored JSON-only instruction, narrated instead — unreliable for automated pipeline'
  WHERE "id" = 'anthropic/claude-opus-4-8:online';

-- perplexity/sonar-deep-research stays at 95 (not re-benchmarked, known gold standard)
