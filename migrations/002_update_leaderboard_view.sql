/*
  # Update Contest Leaderboard View to Use contest_links

  This migration:
  1. Updates the contest_leaderboards view to read from contest_links instead of video_links
  2. Updates the get_contest_leaderboard function to use the updated view
*/

-- 1. Update the leaderboard view to use contest_links
CREATE OR REPLACE VIEW contest_leaderboards AS
SELECT 
  cl.contest_id,
  cl.id as video_id,
  cl.created_by as user_id,
  p.full_name,
  p.email,
  tp.username as tiktok_username,
  tp.display_name as tiktok_display_name,
  cl.title as video_title,
  cl.url as video_url,
  cl.thumbnail,
  cl.views,
  cl.likes,
  cl.comments,
  cl.shares,
  cl.submission_date,
  ROW_NUMBER() OVER (PARTITION BY cl.contest_id ORDER BY cl.views DESC, cl.likes DESC, cl.submission_date ASC) as rank
FROM contest_links cl
JOIN profiles p ON cl.created_by = p.id
LEFT JOIN tiktok_profiles tp ON p.id = tp.user_id
WHERE cl.is_contest_submission = true 
  AND cl.contest_id IS NOT NULL
  AND cl.active IS NOT FALSE; -- Use IS NOT FALSE to include NULL values

-- 2. Update the get_contest_leaderboard function to match the view structure
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

-- 3. Create or update the freeze_contest_winners function
CREATE OR REPLACE FUNCTION freeze_contest_winners(p_contest_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  win_count INTEGER;
  admin_id UUID;
BEGIN
  -- Get the number of winners for this contest
  SELECT num_winners INTO win_count FROM contests WHERE id = p_contest_id;
  
  -- Get an admin ID for created_by field
  SELECT id INTO admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  
  -- If no admin found, use the contest creator
  IF admin_id IS NULL THEN
    SELECT created_by INTO admin_id FROM contests WHERE id = p_contest_id;
  END IF;
  
  -- Insert winners from the leaderboard
  INSERT INTO contest_winners 
    (contest_id, user_id, video_id, position, prize_amount, prize_title, created_by)
  SELECT 
    cl.contest_id,
    cl.user_id,
    cl.video_id,
    cl.rank AS position,
    CASE 
      WHEN c.prize_per_winner IS NOT NULL THEN 
        ROUND((c.prize_per_winner * (1 - (cl.rank-1)*0.2))::numeric, 2)
      ELSE NULL
    END AS prize_amount,
    CASE
      WHEN c.prize_titles IS NOT NULL AND 
           jsonb_array_length(c.prize_titles::jsonb) >= cl.rank THEN
        (c.prize_titles::jsonb->>(cl.rank-1)::int->'title')::VARCHAR
      ELSE
        CASE 
          WHEN cl.rank = 1 THEN 'First Place'
          WHEN cl.rank = 2 THEN 'Second Place'
          WHEN cl.rank = 3 THEN 'Third Place'
          ELSE 'Winner'
        END
    END AS prize_title,
    admin_id AS created_by
  FROM contest_leaderboards cl
  JOIN contests c ON c.id = cl.contest_id
  WHERE cl.contest_id = p_contest_id
  ORDER BY cl.rank
  LIMIT win_count
  ON CONFLICT (contest_id, position) DO NOTHING;
END;
$$;

-- 4. Create or update the trigger function to freeze winners on contest completion
CREATE OR REPLACE FUNCTION trg_on_contest_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only run when status changes to 'completed' or 'ended'
  IF (TG_OP = 'UPDATE') AND
     ((OLD.status::text != 'completed' AND NEW.status::text = 'completed') OR
      (OLD.status::text != 'ended' AND NEW.status::text = 'ended')) THEN
    -- Freeze the winners
    PERFORM freeze_contest_winners(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trg_contest_completed ON contests;
CREATE TRIGGER trg_contest_completed
  AFTER UPDATE OF status ON contests
  FOR EACH ROW
  EXECUTE FUNCTION trg_on_contest_completed(); 