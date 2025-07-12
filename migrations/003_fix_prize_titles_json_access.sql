/*
  # Fix Prize Titles JSON Access in freeze_contest_winners Function
  
  This migration fixes the JSON operator error in the freeze_contest_winners function
  where the prize_titles JSON access was using incorrect syntax.
*/

-- Fix the freeze_contest_winners function with correct JSON access syntax
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
        -- Fixed JSON access: use -> to get JSON element, then ->> to get text
        (c.prize_titles::jsonb -> (cl.rank-1) ->> 'title')::VARCHAR
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