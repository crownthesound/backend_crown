# Database Migrations for Contest Platform

This folder contains SQL migrations to set up the database structure for your TikTok contest platform.

## Migration Files

### 001_adjust_contest_structure.sql

This is the main migration that transforms your existing database structure into a proper contest platform:

**What it does:**

1. **Renames** `leaderboard_config` table to `contests`
2. **Creates** new enum type `contest_status` (draft, active, ended, archived)
3. **Adjusts** contests table structure with new fields:
   - `guidelines` - Contest guidelines for participants
   - `rules` - Contest rules and requirements
   - `hashtags` - Array of hashtags for the contest
   - `max_participants` - Maximum number of participants allowed
   - `submission_deadline` - When submissions close
4. **Creates** `tiktok_profiles` table to store TikTok account information
5. **Creates** `contest_participants` table to track who joined which contest
6. **Adjusts** `video_links` table to support contest submissions
7. **Creates** `contest_winners` table to track contest winners
8. **Creates** database view `contest_leaderboards` for easy ranking
9. **Adds** performance indexes
10. **Creates** helper functions:
    - `get_contest_leaderboard()` - Get ranked participants for a contest
    - `can_user_join_contest()` - Check if user can join a contest
11. **Sets up** Row Level Security (RLS) policies

### 002_sample_data.sql

Contains sample data to help you test the system with realistic contest examples.

## How to Run Migrations

### Option 1: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the content of `001_adjust_contest_structure.sql`
4. Run the migration
5. Optionally run `002_sample_data.sql` for test data

### Option 2: Using Supabase CLI

```bash
# Make sure you're in the project root
cd /path/to/your/project

# Run the main migration
supabase db reset --db-url "your-supabase-db-url" < backend/migrations/001_adjust_contest_structure.sql

# Optionally add sample data
supabase db reset --db-url "your-supabase-db-url" < backend/migrations/002_sample_data.sql
```

### Option 3: Using psql directly

```bash
psql "your-supabase-connection-string" -f backend/migrations/001_adjust_contest_structure.sql
psql "your-supabase-connection-string" -f backend/migrations/002_sample_data.sql
```

## Database Schema Overview

After running the migration, your database will have these main tables:

### Core Tables

- **`profiles`** - User profiles (existing, with roles: user, admin, organizer)
- **`contests`** - Contest information and settings
- **`contest_participants`** - Who joined which contest
- **`tiktok_profiles`** - TikTok account data for users
- **`video_links`** - Video submissions and TikTok videos
- **`contest_winners`** - Contest winners and prizes

### Key Features

- **Role-based access**: Admins and organizers can create contests, users can participate
- **Contest lifecycle**: draft → active → ended → archived
- **TikTok integration**: Store TikTok profile data and video metrics
- **Leaderboard system**: Automatic ranking based on views, likes, and submission time
- **Security**: Row Level Security policies protect user data

## Usage Examples

### Get contest leaderboard

```sql
SELECT * FROM get_contest_leaderboard('contest-uuid-here', 10);
```

### Check if user can join contest

```sql
SELECT can_user_join_contest('user-uuid', 'contest-uuid');
```

### Get all active contests

```sql
SELECT * FROM contests WHERE status = 'active';
```

### Get user's contest submissions

```sql
SELECT * FROM video_links
WHERE created_by = 'user-uuid'
AND is_contest_submission = true;
```

## Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Run migrations in a test environment first
3. **User Data**: The sample data file assumes you have admin/organizer users
4. **TikTok Integration**: You'll need to populate TikTok profiles when users connect their accounts
5. **Video Stats**: You'll need to implement a system to regularly update video statistics from TikTok API

## Next Steps

After running the migrations:

1. Update your TypeScript types to match the new schema
2. Update your backend controllers to work with the new table structure
3. Implement TikTok OAuth flow to populate `tiktok_profiles`
4. Create endpoints for contest management
5. Build the leaderboard display functionality
6. Set up a cron job to update video statistics regularly
