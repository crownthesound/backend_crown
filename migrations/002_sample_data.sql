-- Sample Data for Contest Platform
-- Run this after the main migration to populate test data

-- Insert sample contests
INSERT INTO contests (
  id, 
  name, 
  description, 
  guidelines,
  rules,
  hashtags,
  start_date, 
  end_date, 
  submission_deadline,
  status, 
  total_prize, 
  num_winners,
  max_participants,
  cover_image,
  created_by,
  created_at
) VALUES 
(
  gen_random_uuid(),
  'Summer Dance Challenge 2024',
  'Show off your best dance moves this summer! Create an amazing dance video and win exciting prizes.',
  'Create a 15-60 second dance video showcasing your unique style. Be creative, have fun, and make sure to follow the beat!',
  '1. Video must be 15-60 seconds long
2. Must include the official hashtag #SummerDance2024
3. Original content only - no copyrighted music without permission
4. Keep it family-friendly
5. One submission per participant',
  ARRAY['#SummerDance2024', '#DanceChallenge', '#Summer2024'],
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '30 days',
  NOW() + INTERVAL '25 days',
  'active',
  5000.00,
  3,
  500,
  'https://example.com/summer-dance-cover.jpg',
  (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
  NOW()
),
(
  gen_random_uuid(),
  'Comedy Skit Contest',
  'Make us laugh with your funniest original comedy content!',
  'Create hilarious, original comedy content that will make everyone laugh. Skits, jokes, funny situations - anything goes as long as it''s original and appropriate.',
  '1. Must be original content
2. Keep it appropriate for all audiences
3. Duration: 30-90 seconds
4. Use hashtag #ComedyContest2024
5. No offensive or inappropriate content',
  ARRAY['#ComedyContest2024', '#Comedy', '#Funny'],
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '45 days',
  NOW() + INTERVAL '40 days',
  'draft',
  3000.00,
  5,
  300,
  'https://example.com/comedy-contest-cover.jpg',
  (SELECT id FROM profiles WHERE role = 'organizer' LIMIT 1),
  NOW()
),
(
  gen_random_uuid(),
  'Cooking Challenge',
  'Show us your culinary skills! Create amazing cooking content and share your recipes.',
  'Create engaging cooking videos showing your favorite recipes, cooking tips, or food presentation skills.',
  '1. Show the cooking process clearly
2. Include ingredients list in description
3. Video length: 60-180 seconds
4. Use hashtag #CookingChallenge2024
5. Food safety first!',
  ARRAY['#CookingChallenge2024', '#Cooking', '#Recipe'],
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '2 days',
  'ended',
  2000.00,
  3,
  200,
  'https://example.com/cooking-challenge-cover.jpg',
  (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
  NOW() - INTERVAL '10 days'
);

-- Note: The sample data above assumes you have at least one admin and one organizer user
-- You might need to adjust the created_by values based on your actual user data

-- Sample TikTok profiles (you'll need real user IDs)
-- INSERT INTO tiktok_profiles (
--   user_id,
--   tiktok_user_id,
--   username,
--   display_name,
--   avatar_url,
--   follower_count,
--   following_count,
--   likes_count,
--   video_count,
--   is_verified
-- ) VALUES 
-- (
--   'your-user-id-here',
--   'tiktok123456',
--   'dancequeen2024',
--   'Dance Queen 👑',
--   'https://example.com/avatar1.jpg',
--   15000,
--   500,
--   250000,
--   45,
--   false
-- );

-- Sample video submissions (you'll need real user IDs and contest IDs)
-- INSERT INTO video_links (
--   contest_id,
--   created_by,
--   tiktok_video_id,
--   title,
--   url,
--   thumbnail,
--   username,
--   views,
--   likes,
--   comments,
--   shares,
--   duration,
--   is_contest_submission,
--   submission_date,
--   active
-- ) VALUES
-- (
--   'your-contest-id-here',
--   'your-user-id-here',
--   'tiktok-video-123',
--   'My Amazing Dance Moves!',
--   'https://tiktok.com/@user/video/123',
--   'https://example.com/thumbnail1.jpg',
--   'dancequeen2024',
--   12500,
--   890,
--   45,
--   23,
--   45,
--   true,
--   NOW() - INTERVAL '2 days',
--   true
-- ); 