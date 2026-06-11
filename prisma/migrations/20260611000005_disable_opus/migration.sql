-- Disable claude-opus-4-8:online: ignores response_format, narrates extended thinking as raw output
UPDATE "ResearchModel" SET "allowed" = false WHERE "id" = 'anthropic/claude-opus-4-8:online';
