-- Update ResearchModel IDs to :online variants so agents are required to use web search
-- Scores raised to reflect real-citation capability with web access

UPDATE "ResearchModel" SET "id" = 'openai/o3:online',                    "score" = 90 WHERE "id" = 'openai/o3';
UPDATE "ResearchModel" SET "id" = 'google/gemini-2.5-pro:online',         "score" = 85 WHERE "id" = 'google/gemini-2.5-pro';
UPDATE "ResearchModel" SET "id" = 'anthropic/claude-opus-4-8:online',     "score" = 82 WHERE "id" = 'anthropic/claude-opus-4-8';
UPDATE "ResearchModel" SET "id" = 'openai/gpt-4o:online',                 "score" = 78 WHERE "id" = 'openai/gpt-4o';
UPDATE "ResearchModel" SET "id" = 'anthropic/claude-sonnet-4-6:online',   "score" = 72 WHERE "id" = 'anthropic/claude-sonnet-4-6';
UPDATE "ResearchModel" SET "id" = 'google/gemini-2.5-flash:online',       "score" = 65 WHERE "id" = 'google/gemini-2.5-flash';

-- perplexity/sonar-deep-research stays as-is (built-in search, no :online needed)
