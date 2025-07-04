-- Debug why contests with same-day start and end dates are being marked as completed

-- 1. Check how dates are stored and compared
SELECT 
  id, 
  name,
  start_date,
  end_date,
  status,
  now() AT TIME ZONE 'UTC' AS current_time_utc,
  (end_date AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date AS same_day_as_today,
  end_date - now() AS time_until_end,
  end_date < now() AS end_date_passed,
  end_date < (now() - interval '5 minutes') AS end_date_passed_with_buffer
FROM contests
WHERE (start_date::date = end_date::date)
ORDER BY end_date DESC;

-- 2. Check if there's a timezone issue
SELECT 
  current_setting('timezone') AS server_timezone,
  now() AS server_time,
  now() AT TIME ZONE 'UTC' AS utc_time;

-- 3. Fix for contests with same-day start and end dates
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
      start_date::date = end_date::date
      AND end_date > now()
      AND status = 'ended'::contest_status;
  ELSE
    -- For string type status
    UPDATE contests
    SET 
      status = 'active',
      updated_at = now()
    WHERE 
      start_date::date = end_date::date
      AND end_date > now()
      AND status = 'completed';
  END IF;
END $$;

-- 4. Let's also check the trigger function
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'update_contest_status';

-- 5. Modify the function to handle same-day contests better
CREATE OR REPLACE FUNCTION update_contest_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  status_type text;
BEGIN
  -- Check the data type of the status column
  SELECT data_type INTO status_type 
  FROM information_schema.columns 
  WHERE table_name = 'contests' AND column_name = 'status';
  
  -- Only change status if we're past the exact end time (with buffer)
  -- This ensures same-day contests stay active until their exact end time
  IF NEW.end_date < (now() - interval '5 minutes') AND NEW.status = 'active' THEN
    -- Apply different logic based on the status column type
    IF status_type = 'USER-DEFINED' THEN
      NEW.status := 'ended'::contest_status;
    ELSE
      NEW.status := 'completed';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$; 