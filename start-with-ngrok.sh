#!/bin/bash

echo "🚀 Starting Crown Contest Platform with ngrok..."
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed. Please install it first:"
    echo "   sudo snap install ngrok"
    echo "   or download from https://ngrok.com/download"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Please create one based on env.example"
    exit 1
fi

echo "✅ Starting backend server on port 3001..."
npm start &
SERVER_PID=$!

# Wait a moment for server to start
sleep 3

echo ""
echo "🔗 Starting ngrok tunnel..."
echo ""
echo "📋 IMPORTANT INSTRUCTIONS:"
echo "1. Copy the HTTPS URL from ngrok output below"
echo "2. Go to TikTok Developers and set redirect URI to: https://YOUR-NGROK-URL/api/v1/tiktok/callback"
echo "3. Update your .env file with: TIKTOK_REDIRECT_URI=https://YOUR-NGROK-URL/api/v1/tiktok/callback"
echo "4. Visit the HTTPS URL to test your app"
echo ""
echo "Press Ctrl+C to stop both server and ngrok"
echo "----------------------------------------"

# Start ngrok and keep it in foreground
ngrok http 3001

# If ngrok exits, kill the server too
kill $SERVER_PID 