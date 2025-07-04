-- Migration: Fix Contest Status
-- Description: Fix contests incorrectly marked as completed and add 5-minute buffer to status updates

-- First check if we need to convert string status to enum
DO $$
DECLARE
  status_type text;
BEGIN
  -- Check the data type of the status column
  SELECT data_type INTO status_type 
  FROM information_schema.columns 
  WHERE table_name = 'contests' AND column_name = 'status';
  
  -- If it's already an enum type, we don't need to do anything special
  IF status_type = 'USER-DEFINED' THEN
    -- 1. Update any contests that were incorrectly marked as completed
    UPDATE contests
    SET 
      status = 'active'::contest_status,
      updated_at = now()
    WHERE 
      status = 'ended'::contest_status 
      AND end_date > (now() - interval '5 minutes');
    
    -- 2. Update any contests that should be completed (more than 5 minutes past end date)
    UPDATE contests
    SET 
      status = 'ended'::contest_status,
      updated_at = now()
    WHERE 
      status = 'active'::contest_status 
      AND end_date < (now() - interval '5 minutes');
  ELSE
    -- For string-based status
    -- 1. Update any contests that were incorrectly marked as completed
    UPDATE contests
    SET 
      status = 'active',
      updated_at = now()
    WHERE 
      status = 'completed' 
      AND end_date > (now() - interval '5 minutes');
    
    -- 2. Update any contests that should be completed (more than 5 minutes past end date)
    UPDATE contests
    SET 
      status = 'completed',
      updated_at = now()
    WHERE 
      status = 'active' 
      AND end_date < (now() - interval '5 minutes');
  END IF;
END $$;

-- 3. Recreate the update_contest_status function with 5-minute buffer
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
  
  -- Apply different logic based on the status column type
  IF status_type = 'USER-DEFINED' THEN
    -- For enum type status
    IF NEW.end_date < (now() - interval '5 minutes') AND NEW.status = 'active' THEN
      NEW.status := 'ended'::contest_status;
      NEW.updated_at := now();
    END IF;
  ELSE
    -- For string type status
    IF NEW.end_date < (now() - interval '5 minutes') AND NEW.status = 'active' THEN
      NEW.status := 'completed';
      NEW.updated_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Ensure trigger exists
DROP TRIGGER IF EXISTS check_contest_status ON contests;
CREATE TRIGGER check_contest_status
  BEFORE UPDATE OR INSERT
  ON contests
  FOR EACH ROW
  EXECUTE FUNCTION update_contest_status(); 