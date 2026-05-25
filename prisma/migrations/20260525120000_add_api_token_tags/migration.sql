-- Add tags column to api_token for token categorization and filtering
ALTER TABLE "api_token" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
