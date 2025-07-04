# Crown Backend Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Configuration

```bash
cp env.example .env
```

Edit the `.env` file with your actual credentials:

```env
# Server Configuration
NODE_ENV=development
PORT=3001
API_VERSION=v1

# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# TikTok API Configuration (Optional for basic testing)
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_REDIRECT_URI=http://localhost:3001/api/v1/auth/tiktok/callback

# JWT Configuration (REQUIRED)
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# CORS Configuration
FRONTEND_URL=http://localhost:5173
```

### 3. Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or select existing one
3. Go to Settings → API
4. Copy:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

### 4. Generate JWT Secret

```bash
# Generate a random JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests (when implemented)
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## 📱 TikTok API Setup (Optional)

### 1. Create TikTok Developer Account

1. Visit [TikTok for Developers](https://developers.tiktok.com/)
2. Sign up with your TikTok account
3. Complete identity verification

### 2. Create an App

1. Go to "Manage apps" in the developer portal
2. Click "Create an app"
3. Fill in app details:
   - App name: Crown Contest Platform
   - Category: Entertainment
   - Description: Contest platform for TikTok creators

### 3. Configure Login Kit

1. In your app settings, go to "Login Kit"
2. Add redirect URI: `http://localhost:3001/api/v1/auth/tiktok/callback`
3. Select scopes:
   - `user.info.basic` - Get user profile info
   - `video.list` - Access user's videos
   - `video.upload` - Upload videos (if needed)

### 4. Get API Credentials

1. Copy Client Key → `TIKTOK_CLIENT_KEY`
2. Copy Client Secret → `TIKTOK_CLIENT_SECRET`

## 🧪 Testing the API

### Health Check

```bash
curl http://localhost:3001/health
```

### Test Authentication (requires Supabase setup)

```bash
# Sign up
curl -X POST http://localhost:3001/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","fullName":"Test User"}'
```

### Test TikTok OAuth (requires TikTok API setup)

```bash
curl http://localhost:3001/api/v1/tiktok/auth
```

## 🗂️ Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── env.ts       # Environment validation
│   │   └── supabase.ts  # Supabase client setup
│   ├── controllers/     # Route handlers
│   │   ├── authController.ts
│   │   ├── contestController.ts
│   │   ├── profileController.ts
│   │   └── tiktokController.ts
│   ├── middleware/      # Custom middleware
│   │   ├── authMiddleware.ts
│   │   ├── errorHandler.ts
│   │   └── notFoundHandler.ts
│   ├── routes/          # API routes
│   │   ├── auth.ts
│   │   ├── contests.ts
│   │   ├── profiles.ts
│   │   └── tiktok.ts
│   ├── services/        # Business logic
│   │   └── tiktokService.ts
│   ├── types/           # TypeScript types
│   │   └── database.ts
│   ├── utils/           # Helper functions
│   │   └── logger.ts
│   └── index.ts         # App entry point
├── dist/                # Built files (generated)
├── logs/                # Log files (generated)
├── package.json
├── tsconfig.json
├── .env                 # Your environment variables
└── README.md
```

## 🔐 Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **JWT Authentication**: Secure token-based auth via Supabase
- **Input Validation**: Request data validation
- **Error Handling**: Comprehensive error management
- **Logging**: Winston for structured logging

## 📊 API Endpoints

### Authentication

- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/signin` - User login
- `POST /api/v1/auth/signout` - User logout
- `GET /api/v1/auth/me` - Get current user profile
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password

### TikTok Integration

- `GET /api/v1/tiktok/auth` - Initiate TikTok OAuth
- `GET /api/v1/tiktok/auth/callback` - TikTok OAuth callback
- `GET /api/v1/tiktok/profile` - Get TikTok profile (requires auth)
- `GET /api/v1/tiktok/videos` - Get user's TikTok videos (requires auth)
- `POST /api/v1/tiktok/videos` - Upload video to TikTok (requires auth)
- `GET /api/v1/tiktok/videos/:videoId` - Get video details (requires auth)
- `GET /api/v1/tiktok/contest-videos` - Get contest videos by hashtag
- `POST /api/v1/tiktok/scrape-video` - Scrape video data from URL

### Contests

- `GET /api/v1/contests` - Get all contests
- `GET /api/v1/contests/active` - Get active contests
- `GET /api/v1/contests/:id` - Get contest details
- `GET /api/v1/contests/:id/leaderboard` - Get contest leaderboard
- `POST /api/v1/contests/:id/join` - Join contest (requires auth)
- `POST /api/v1/contests/:id/submit-video` - Submit video to contest (requires auth)
- `GET /api/v1/contests/:id/my-submissions` - Get my submissions (requires auth)

#### Admin/Organizer Only

- `POST /api/v1/contests` - Create contest
- `PATCH /api/v1/contests/:id` - Update contest
- `DELETE /api/v1/contests/:id` - Delete contest
- `PATCH /api/v1/contests/:id/status` - Update contest status
- `GET /api/v1/contests/:id/submissions` - Get all submissions
- `PATCH /api/v1/contests/:id/submissions/:submissionId/approve` - Approve submission
- `PATCH /api/v1/contests/:id/submissions/:submissionId/reject` - Reject submission

### Profiles

- `GET /api/v1/profiles/me` - Get my profile (requires auth)
- `PATCH /api/v1/profiles/me` - Update my profile (requires auth)
- `GET /api/v1/profiles/leaderboard` - Get global leaderboard

#### Admin Only

- `GET /api/v1/profiles` - Get all profiles
- `GET /api/v1/profiles/:id` - Get specific profile
- `PATCH /api/v1/profiles/:id` - Update any profile
- `DELETE /api/v1/profiles/:id` - Delete profile
- `PATCH /api/v1/profiles/:id/role` - Update user role

## 🚨 Troubleshooting

### Common Issues

1. **Build Errors**

   ```bash
   npm run build
   ```

   If you see TypeScript errors, check that all dependencies are installed.

2. **Environment Variables**

   - Make sure `.env` file exists and has all required variables
   - Check that Supabase credentials are correct
   - Ensure JWT_SECRET is set

3. **Database Connection**

   - Verify Supabase project is active
   - Check that service role key has proper permissions
   - Ensure database tables exist (run migrations if needed)

4. **TikTok API Issues**
   - Verify TikTok app is approved and active
   - Check redirect URI matches exactly
   - Ensure client credentials are correct

### Logs

Check the logs for detailed error information:

```bash
# Development logs (console)
npm run dev

# Production logs (files)
tail -f logs/error.log
tail -f logs/combined.log
```

## 🔄 Next Steps

1. **Database Setup**: Ensure your Supabase database has the correct tables and RLS policies
2. **Frontend Integration**: Connect your React frontend to use these API endpoints
3. **TikTok Features**: Implement video submission and contest participation flows
4. **Testing**: Add comprehensive test coverage
5. **Deployment**: Deploy to your preferred hosting platform (Vercel, Railway, etc.)

## 📝 Notes

- The TikTok service includes placeholder implementations for some features that require additional setup or third-party services
- Contest and submission logic includes basic placeholders that should be expanded based on your specific requirements
- Error handling is comprehensive but can be customized for your needs
- Logging is configured for both development and production environments
