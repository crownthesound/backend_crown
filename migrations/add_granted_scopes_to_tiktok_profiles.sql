-- Add granted_scopes column to tiktok_profiles table
-- This stores the OAuth scopes that were granted by the user during TikTok authorization

ALTER TABLE tiktok_profiles 
ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN tiktok_profiles.granted_scopes IS 'Comma-separated list of OAuth scopes granted by user during TikTok authorization (e.g., "user.info.basic,video.list")';
