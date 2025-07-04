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
    WHEN end_date > now() AND status != 'active' AND status != 'draft' THEN 'Incorrectly marked as completed/ended'
    ELSE 'Status is correct'
  END AS status_diagnosis
FROM contests
WHERE 
  (end_date < now() AND end_date > (now() - interval '5 minutes') AND status != 'active' AND status != 'draft')
  OR (end_date < (now() - interval '5 minutes') AND status = 'active')
  OR (end_date > now() AND status != 'active' AND status != 'draft');

-- Fix any contests that are incorrectly marked as completed/ended
DO $$
DECLARE
  status_type text;
BEGIN
  -- Check the data type of the status column
  SELECT data_type INTO status_type 
  FROM information_schema.columns 
  WHERE table_name = 'contests' AND column_name = 'status';
  
  -- Apply different logic based on the status column type
  IF status_type = 'USER-DEFINED' THEN
    -- For enum type status
    UPDATE contests
    SET 
      status = 'active'::contest_status,
      updated_at = now()
    WHERE 
      (status = 'ended'::contest_status OR status = 'archived'::contest_status)
      AND end_date > (now() - interval '5 minutes');
  ELSE
    -- For string type status
    UPDATE contests
    SET 
      status = 'active',
      updated_at = now()
    WHERE 
      (status = 'completed' OR status = 'ended')
      AND end_date > (now() - interval '5 minutes');
  END IF;
END $$; 