-- Round 3: Gemini Pro restored after json_object response_format fix
-- Real PMC citation (200), 0.90 confidence, excellent notes — parse failure was format issue not capability
-- Also document that Opus is unreliable regardless of response_format (narrates tool-use chains)

UPDATE "ResearchModel"
SET "score" = 82,
    "notes" = 'Round 3: json_object response_format fixes output. Real PMC citation, 0.90 conf, good notes. Use response_format:{type:"json_object"} in requests.'
WHERE "id" = 'google/gemini-2.5-pro:online';

UPDATE "ResearchModel"
SET "notes" = 'Round 3: json_object has no effect — model narrates extended thinking as raw output. Unreliable for automated JSON pipeline regardless of response_format.'
WHERE "id" = 'anthropic/claude-opus-4-8:online';
