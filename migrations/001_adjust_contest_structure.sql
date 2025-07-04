-- Migration: Adjust Contest Structure
-- Description: Restructure database for contest platform with TikTok integration

-- 1. Rename and adjust leaderboard_config to contests table
ALTER TABLE leaderboard_config RENAME TO contests;

-- 2. Add contest status enum
DO $$ BEGIN
    CREATE TYPE contest_status AS ENUM ('draft', 'active', 'ended', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Adjust contests table structure
ALTER TABLE contests 
  DROP COLUMN IF EXISTS base_points,
  DROP COLUMN IF EXISTS bonus_multiplier,
  DROP COLUMN IF EXISTS last_reset,
  DROP COLUMN IF EXISTS prize_tier,
  DROP COLUMN IF EXISTS regions,
  DROP COLUMN IF EXISTS resources,
  ADD COLUMN IF NOT EXISTS guidelines TEXT,
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS hashtags TEXT[],
  ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMP WITH TIME ZONE;

-- Handle status column conversion separately to avoid casting issues
DO $$ 
BEGIN
  -- First, drop any existing default on status column
  ALTER TABLE contests ALTER COLUMN status DROP DEFAULT;
  
  -- Convert the column type with explicit casting
  ALTER TABLE contests ALTER COLUMN status TYPE contest_status USING 
    CASE 
      WHEN status IS NULL THEN 'draft'::contest_status
      WHEN status = 'active' THEN 'active'::contest_status
      WHEN status = 'inactive' THEN 'draft'::contest_status
      WHEN status = 'ended' THEN 'ended'::contest_status
      WHEN status = 'archived' THEN 'archived'::contest_status
      ELSE 'draft'::contest_status
    END;
  
  -- Set the new default
  ALTER TABLE contests ALTER COLUMN status SET DEFAULT 'draft'::contest_status;
EXCEPTION
  WHEN OTHERS THEN
    -- If the column doesn't exist or other issues, just add it
    ALTER TABLE contests ADD COLUMN IF NOT EXISTS status contest_status DEFAULT 'draft'::contest_status;
END $$;

-- Continue with other column modifications
ALTER TABLE contests
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL,
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN num_winners SET DEFAULT 3,
  ALTER COLUMN total_prize SET DEFAULT 0;

-- 4. Create TikTok profiles table for storing TikTok account info
CREATE TABLE IF NOT EXISTS tiktok_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tiktok_user_id VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_user_tiktok UNIQUE(user_id)
);

-- 5. Create contest participants table
CREATE TABLE IF NOT EXISTS contest_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  CONSTRAINT unique_contest_participant UNIQUE(contest_id, user_id)
);

-- 6. Adjust video_links table for contest submissions
ALTER TABLE video_links 
  ADD COLUMN IF NOT EXISTS contest_id UUID REFERENCES contests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tiktok_video_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_contest_submission BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS submission_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_stats_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Handle created_by column separately to deal with existing NULL values
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Try to find an admin user to assign orphaned videos to
  SELECT id INTO admin_user_id 
  FROM profiles 
  WHERE role = 'admin' OR role = 'organizer'
  ORDER BY created_at ASC 
  LIMIT 1;
  
  -- If no admin found, try to get any user
  IF admin_user_id IS NULL THEN
    SELECT id INTO admin_user_id 
    FROM profiles 
    ORDER BY created_at ASC 
    LIMIT 1;
  END IF;
  
  -- If we found a user, update NULL values
  IF admin_user_id IS NOT NULL THEN
    UPDATE video_links 
    SET created_by = admin_user_id 
    WHERE created_by IS NULL;
    
    -- Now we can safely set the NOT NULL constraint
    ALTER TABLE video_links ALTER COLUMN created_by SET NOT NULL;
  ELSE
    -- If no users exist, we can't set NOT NULL constraint
    -- This might be a fresh database, so we'll just add a comment
    -- The constraint will be enforced by the application
    RAISE NOTICE 'No users found in profiles table. Skipping NOT NULL constraint on video_links.created_by';
  END IF;
END $$;

-- 7. Create contest winners table
CREATE TABLE IF NOT EXISTS contest_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES video_links(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  prize_amount DECIMAL(10,2),
  prize_title VARCHAR(255),
  announced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_contest_position UNIQUE(contest_id, position),
  CONSTRAINT unique_contest_winner UNIQUE(contest_id, user_id)
);

-- 8. Create leaderboard view for easy ranking
CREATE OR REPLACE VIEW contest_leaderboards AS
SELECT 
  vl.contest_id,
  vl.id as video_id,
  vl.created_by as user_id,
  p.full_name,
  p.email,
  tp.username as tiktok_username,
  tp.display_name as tiktok_display_name,
  vl.title as video_title,
  vl.url as video_url,
  vl.thumbnail,
  vl.views,
  vl.likes,
  vl.comments,
  vl.shares,
  vl.submission_date,
  ROW_NUMBER() OVER (PARTITION BY vl.contest_id ORDER BY vl.views DESC, vl.likes DESC, vl.submission_date ASC) as rank
FROM video_links vl
JOIN profiles p ON vl.created_by = p.id
LEFT JOIN tiktok_profiles tp ON p.id = tp.user_id
WHERE vl.is_contest_submission = true 
  AND vl.contest_id IS NOT NULL
  AND vl.active = true;

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contests_status ON contests(status);
CREATE INDEX IF NOT EXISTS idx_contests_dates ON contests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contest_participants_contest ON contest_participants(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_participants_user ON contest_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_video_links_contest ON video_links(contest_id);
CREATE INDEX IF NOT EXISTS idx_video_links_contest_submission ON video_links(contest_id, is_contest_submission);
CREATE INDEX IF NOT EXISTS idx_video_links_views ON video_links(views DESC);
CREATE INDEX IF NOT EXISTS idx_tiktok_profiles_user ON tiktok_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_contest_winners_contest ON contest_winners(contest_id);

-- 10. Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 11. Add updated_at triggers
DROP TRIGGER IF EXISTS update_contests_updated_at ON contests;
CREATE TRIGGER update_contests_updated_at 
  BEFORE UPDATE ON contests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tiktok_profiles_updated_at ON tiktok_profiles;
CREATE TRIGGER update_tiktok_profiles_updated_at 
  BEFORE UPDATE ON tiktok_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_video_links_updated_at ON video_links;
CREATE TRIGGER update_video_links_updated_at 
  BEFORE UPDATE ON video_links 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add function to update contest status with 5-minute buffer
CREATE OR REPLACE FUNCTION update_contest_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the contest has ended with at least a 5-minute buffer
  IF NEW.end_date < (now() - interval '5 minutes') AND NEW.status = 'active' THEN
    NEW.status := 'ended'::contest_status;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to automatically update status when end date is reached (with buffer)
DROP TRIGGER IF EXISTS check_contest_status ON contests;
CREATE TRIGGER check_contest_status
  BEFORE UPDATE OR INSERT
  ON contests
  FOR EACH ROW
  EXECUTE FUNCTION update_contest_status();

-- 12. Create function to get contest leaderboard
CREATE OR REPLACE FUNCTION get_contest_leaderboard(contest_uuid UUID, limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  full_name TEXT,
  tiktok_username VARCHAR(100),
  tiktok_display_name VARCHAR(255),
  video_id UUID,
  video_title TEXT,
  video_url TEXT,
  thumbnail TEXT,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  submission_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.rank,
    cl.user_id,
    cl.full_name,
    cl.tiktok_username,
    cl.tiktok_display_name,
    cl.video_id,
    cl.video_title,
    cl.video_url,
    cl.thumbnail,
    cl.views,
    cl.likes,
    cl.comments,
    cl.shares,
    cl.submission_date
  FROM contest_leaderboards cl
  WHERE cl.contest_id = contest_uuid
  ORDER BY cl.rank
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 13. Create function to check if user can join contest
CREATE OR REPLACE FUNCTION can_user_join_contest(user_uuid UUID, contest_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  contest_record RECORD;
  participant_count INTEGER;
BEGIN
  -- Get contest info
  SELECT * INTO contest_record FROM contests WHERE id = contest_uuid;
  
  -- Check if contest exists and is active
  IF contest_record IS NULL OR contest_record.status != 'active' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if contest is within date range
  IF NOW() < contest_record.start_date OR NOW() > contest_record.end_date THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user is already participating
  IF EXISTS (SELECT 1 FROM contest_participants WHERE contest_id = contest_uuid AND user_id = user_uuid AND is_active = true) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if contest has reached max participants
  SELECT COUNT(*) INTO participant_count FROM contest_participants WHERE contest_id = contest_uuid AND is_active = true;
  IF participant_count >= contest_record.max_participants THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 14. Add RLS policies (Row Level Security)
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_profiles ENABLE ROW LEVEL SECURITY;

-- Contests: Everyone can read active contests, only admins/organizers can modify
CREATE POLICY "Public contests are viewable by everyone" ON contests
  FOR SELECT USING (status = 'active' OR status = 'ended');

CREATE POLICY "Admins and organizers can manage contests" ON contests
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'organizer')
    )
  );

-- Contest participants: Users can see participants, only the user can join/leave
CREATE POLICY "Contest participants are viewable by everyone" ON contest_participants
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own participation" ON contest_participants
  FOR ALL USING (auth.uid() = user_id);

-- TikTok profiles: Users can only see and manage their own
CREATE POLICY "Users can manage their own TikTok profile" ON tiktok_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Contest winners: Everyone can view, only admins/organizers can set
CREATE POLICY "Contest winners are viewable by everyone" ON contest_winners
  FOR SELECT USING (true);

CREATE POLICY "Admins and organizers can manage winners" ON contest_winners
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'organizer')
    )
  ); 