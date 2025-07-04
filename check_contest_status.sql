-- Show the current function definition
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'update_contest_status';

-- Update the function to use a 5-minute buffer
CREATE OR REPLACE FUNCTION update_contest_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the contest has ended with at least a 5-minute buffer
  IF NEW.end_date < (now() - interval '5 minutes') AND NEW.status = 'active' THEN
    NEW.status := 'completed';
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Show contests that would be affected by the change
SELECT 
  id, 
  name,
  start_date,
  end_date,
  status,
  now() AS current_time,
  end_date - now() AS time_until_end,
  CASE 
    WHEN end_date < now() AND end_date > (now() - interval '5 minutes') THEN 'Should be active (within 5-min buffer)'
    WHEN end_date < (now() - interval '5 minutes') AND status = 'active' THEN 'Should be completed (past buffer)'
    WHEN end_date > now() AND status = 'completed' THEN 'Incorrectly marked as completed'
    ELSE 'Status is correct'
  END AS status_diagnosis
FROM contests
WHERE 
  (end_date < now() AND end_date > (now() - interval '5 minutes') AND status = 'completed')
  OR (end_date < (now() - interval '5 minutes') AND status = 'active')
  OR (end_date > now() AND status = 'completed');

-- Fix any contests that are incorrectly marked as completed
UPDATE contests
SET 
  status = 'active',
  updated_at = now()
WHERE 
  status = 'completed' 
  AND end_date > (now() - interval '5 minutes'); 