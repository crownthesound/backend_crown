# Crown Contest Platform - Backend API

A TypeScript Express.js backend API for the Crown Contest Platform with Supabase and TikTok integration.

## Features

- 🚀 Express.js with TypeScript
- 🔐 Supabase Authentication & Database
- 📱 TikTok API Integration
- 🛡️ Security middleware (Helmet, CORS, Rate Limiting)
- 📝 Comprehensive logging with Winston
- 🔄 Error handling middleware
- 📊 Contest management system
- 👥 User profiles and roles
- 🎯 RESTful API design

## Tech Stack

- **Backend**: Express.js, TypeScript, Node.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **External APIs**: TikTok API
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate Limiting
- **Development**: Nodemon, ts-node

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project
- TikTok Developer Account

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd crown/backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**

   ```bash
   cp env.example .env
   ```

4. **Configure Environment Variables**

   Edit `.env` file with your credentials:

   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3001
   API_VERSION=v1

   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # TikTok API Configuration
   TIKTOK_CLIENT_KEY=your_tiktok_client_key
   TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
   TIKTOK_REDIRECT_URI=http://localhost:3001/api/v1/auth/tiktok/callback

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d

   # CORS Configuration
   FRONTEND_URL=http://localhost:5173
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## API Endpoints

### Authentication

- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/signin` - User login
- `POST /api/v1/auth/signout` - User logout
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/refresh` - Refresh token

### TikTok Integration

- `GET /api/v1/tiktok/auth` - Initiate TikTok OAuth
- `GET /api/v1/tiktok/auth/callback` - TikTok OAuth callback
- `GET /api/v1/tiktok/profile` - Get TikTok profile
- `GET /api/v1/tiktok/videos` - Get user's TikTok videos
- `POST /api/v1/tiktok/videos` - Upload video to TikTok

### Contests

- `GET /api/v1/contests` - Get all contests
- `GET /api/v1/contests/active` - Get active contests
- `GET /api/v1/contests/:id` - Get contest details
- `POST /api/v1/contests` - Create contest (admin/organizer)
- `POST /api/v1/contests/:id/join` - Join contest
- `POST /api/v1/contests/:id/submit-video` - Submit video

### Profiles

- `GET /api/v1/profiles/me` - Get my profile
- `PATCH /api/v1/profiles/me` - Update my profile
- `GET /api/v1/profiles/leaderboard` - Get leaderboard
- `GET /api/v1/profiles` - Get all profiles (admin)

## Project Structure

```
src/
├── controllers/     # Route handlers
├── services/        # Business logic
├── models/          # TypeScript types
├── middleware/      # Custom middleware
├── routes/          # API routes
├── utils/           # Helper functions
├── types/           # TypeScript type definitions
├── config/          # Configuration files
└── index.ts         # Application entry point
```

## Environment Variables

| Variable                    | Description               | Required           |
| --------------------------- | ------------------------- | ------------------ |
| `SUPABASE_URL`              | Supabase project URL      | Yes                |
| `SUPABASE_ANON_KEY`         | Supabase anonymous key    | Yes                |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes                |
| `TIKTOK_CLIENT_KEY`         | TikTok app client key     | No                 |
| `TIKTOK_CLIENT_SECRET`      | TikTok app client secret  | No                 |
| `PORT`                      | Server port               | No (default: 3001) |
| `FRONTEND_URL`              | Frontend URL for CORS     | No                 |

## TikTok API Setup

1. **Create TikTok Developer Account**

   - Go to [TikTok for Developers](https://developers.tiktok.com/)
   - Create an account and verify your identity

2. **Create an App**

   - Create a new app in the developer portal
   - Configure app settings and permissions

3. **Get API Credentials**

   - Copy Client Key and Client Secret
   - Add to your `.env` file

4. **Configure Redirect URI**
   - Add your callback URL to the app settings
   - Use: `http://localhost:3001/api/v1/auth/tiktok/callback`

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request throttling
- **JWT Authentication**: Secure token-based auth
- **Input Validation**: Request data validation
- **Error Handling**: Comprehensive error management

## Logging

The application uses Winston for logging:

- Console logging in development
- File logging in production
- Error logs saved to `logs/error.log`
- Combined logs saved to `logs/combined.log`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
