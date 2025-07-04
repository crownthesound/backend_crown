# TikTok Development with ngrok Setup

## Why ngrok is needed

TikTok's developer platform requires HTTPS redirect URIs and doesn't allow `localhost`. ngrok creates a secure tunnel from a public HTTPS URL to your local development server.

## Step-by-Step Setup

### 1. Start your backend server

```bash
cd backend
npm start
```

Your server should be running on `http://localhost:3001`

### 2. Open a new terminal and start ngrok tunnel

```bash
ngrok http 3001
```

### 3. Copy the HTTPS URL

ngrok will display something like:

```
Forwarding    https://abc123.ngrok.io -> http://localhost:3001
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 4. Configure TikTok Developer App

1. Go to [TikTok Developers](https://developers.tiktok.com/)
2. Navigate to your app settings
3. Set the **Redirect URI** to: `https://abc123.ngrok.io/api/v1/tiktok/callback`
4. Save the configuration

### 5. Update your environment variables

In your `backend/.env` file, update:

```env
TIKTOK_REDIRECT_URI=https://abc123.ngrok.io/api/v1/tiktok/callback
```

### 6. Test the integration

Visit: `https://abc123.ngrok.io/` to access your test page with the public URL.

## Important Notes

- **Free ngrok URLs change** every time you restart ngrok
- **Paid ngrok accounts** get persistent subdomains
- Always use the **HTTPS** URL, not HTTP
- Update TikTok app settings whenever the ngrok URL changes
- The ngrok URL works from anywhere on the internet

## Alternative Solutions

### Option 1: ngrok with fixed subdomain (Paid)

```bash
ngrok http 3001 --subdomain=yourapp
# Results in: https://yourapp.ngrok.io
```

### Option 2: Deploy to a cloud service

- Vercel, Netlify, Railway, or Heroku
- Get a permanent HTTPS URL
- Better for production testing

### Option 3: Local development domain

- Use a service like `localtunnel`
- Set up local SSL certificates

## Troubleshooting

### ngrok command not found

```bash
# Install ngrok
sudo snap install ngrok
# or download from https://ngrok.com/download
```

### TikTok callback errors

- Ensure the redirect URI in TikTok app matches exactly
- Check that your backend server is running
- Verify the ngrok tunnel is active
- Check browser console for errors

### Environment variables

Make sure your `.env` file has all required variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_REDIRECT_URI=https://your-ngrok-url.ngrok.io/api/v1/tiktok/callback
```
