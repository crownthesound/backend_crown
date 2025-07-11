import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { config } from "../config/env";
import { CustomError, catchAsync } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { tiktokService } from "../services/tiktokService";
import { supabase, supabaseAdmin } from "../config/supabase";
import crypto from "crypto";

// Helper function to generate PKCE code verifier and challenge
function generatePKCE() {
  // Generate a random code verifier (between 43-128 chars)
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  // Generate code challenge using SHA256
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

const clearTikTokSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    logger.info("TikTok Clear Session - Request received");

    // Check if this is a simple redirect request
    const { token, simple } = req.query;
    const backendUrl = req.protocol + "://" + req.get("host");
    const authUrl = `${backendUrl}/api/v1/tiktok/auth?token=${token}`;

    // Simple redirect for testing
    if (simple === "true") {
      logger.info("TikTok Clear Session - Simple redirect requested");
      return res.redirect(authUrl);
    }

    // Return HTML that clears TikTok session and redirects back to auth WITHOUT force_account_selection
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Clearing TikTok Session...</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 1rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .spinner {
            border: 3px solid rgba(255,255,255,0.3);
            border-top: 3px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h2 { margin: 0 0 0.5rem 0; }
          p { margin: 0; opacity: 0.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h2>Clearing TikTok Session</h2>
          <p>Please wait while we prepare a fresh connection...</p>
        </div>
        
        <script>
          console.log("Starting TikTok session cleanup...");
          
          // Clear all cookies for current domain and TikTok domains
          function clearAllCookies() {
            const cookies = document.cookie.split(";");
            
            for (let cookie of cookies) {
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
              
              // Clear for multiple domain variations
              const domains = [
                window.location.hostname,
                '.' + window.location.hostname,
                '.tiktok.com',
                'tiktok.com',
                '.tiktokcdn.com',
                'tiktokcdn.com'
              ];
              
              const paths = ['/', '/auth', '/login'];
              
              domains.forEach(domain => {
                paths.forEach(path => {
                  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=" + path + ";domain=" + domain;
                  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=" + path;
                });
              });
            }
            console.log("Cookies cleared");
          }
          
          // Clear all storage
          function clearStorage() {
            try {
              localStorage.clear();
              sessionStorage.clear();
              console.log("Storage cleared");
            } catch (e) {
              console.log("Could not clear storage:", e);
            }
          }
          
          // Execute cleanup
          clearAllCookies();
          clearStorage();
          
          // Try to clear TikTok session by opening logout page in iframe
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = 'https://www.tiktok.com/logout';
          document.body.appendChild(iframe);
          
          // Immediate redirect after cleanup - don't wait too long
          setTimeout(function() {
            console.log("Redirecting to TikTok OAuth...");
            console.log("Target URL: ${authUrl}");
            try {
              window.location.href = "${authUrl}";
            } catch (e) {
              console.error("Redirect failed:", e);
              // Force reload with new URL
              window.location.replace("${authUrl}");
            }
          }, 1500);
          
          // Fallback in case something goes wrong
          setTimeout(function() {
            console.log("Fallback redirect triggered");
            console.log("Current URL:", window.location.href);
            if (window.location.href.includes('clear-session')) {
              console.log("Still on clear-session page, forcing redirect");
              window.location.replace("${authUrl}");
            }
          }, 3000);
          
          // Emergency fallback
          setTimeout(function() {
            console.log("Emergency fallback redirect");
            window.location.replace("${authUrl}");
          }, 5000);
        </script>
      </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html");
    return res.send(htmlResponse);
  }
);

const initiateAuth = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract user token from query params or body
    const userToken = (req.query.token as string) || req.body.token;
    const forceAccountSelection =
      req.query.force_account_selection === "true" ||
      req.body.force_account_selection === true;
    const emphasizeVideoPermissions =
      req.query.emphasize_video_permissions === "true" ||
      req.body.emphasize_video_permissions === true;
    
    // Log the authentication attempt
    logger.info(`🔍 TikTok Auth Initiate - User token: ${userToken ? 'Present' : 'Missing'}`);
    
    // If no user token is provided, show a user-friendly error
    if (!userToken || userToken.trim() === '') {
      logger.warn("⚠️ TikTok authentication attempted without user token");
      
      // Return an error page explaining the issue
      return res.send(generateErrorHTML(
        "You must be logged in to connect your TikTok account. Please log in first and try again."
      ));
    }

    // Generate PKCE code challenge and verifier
    const { codeChallenge, codeVerifier } = generatePKCE();

    // Store code verifier in state along with user token if provided
    const stateData = {
      codeVerifier,
      userToken: userToken || "",
      timestamp: Date.now(),
    };

    // Encode state for URL
    const encodedState = encodeURIComponent(
      Buffer.from(JSON.stringify(stateData)).toString("base64")
    );

    // Check if we have a valid TikTok client key
    if (!config.tiktok.clientKey || config.tiktok.clientKey === "") {
      logger.info("TikTok Auth - Using mock mode because client_key is empty");

      // For testing: Instead of redirecting to TikTok, redirect back to our callback
      // with a mock code that our callback handler will recognize
      const mockAuthUrl = `${req.protocol}://${req.get(
        "host"
      )}/api/v1/tiktok/auth/callback?code=MOCK_CODE_FOR_TESTING&state=${encodedState}`;

      logger.info(`TikTok Auth - Generated mock URL: ${mockAuthUrl}`);

      // Redirect to mock URL instead of returning JSON
      return res.redirect(mockAuthUrl);
    }

    // Normal flow with actual TikTok credentials - using only TikTok-supported parameters
    let authUrl = "https://www.tiktok.com/v2/auth/authorize/";
    authUrl += `?client_key=${config.tiktok.clientKey}`;

    // Encode the scopes properly - TikTok is very particular about this
    // Emphasize video.list scope by putting it first if requested
    const scopeOrder = emphasizeVideoPermissions
      ? "video.list,user.info.basic"
      : "user.info.basic,video.list";

    authUrl += `&scope=${encodeURIComponent(scopeOrder)}`;
    authUrl += "&response_type=code";

    // Use the redirect URI from our runtime config so it can differ per environment
    const redirectUri = config.tiktok.redirectUri;
    authUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    authUrl += `&state=${encodedState}`;
    authUrl += `&code_challenge=${codeChallenge}`;
    authUrl += "&code_challenge_method=S256";

    logger.info(`🔍 TikTok Auth - Scopes being requested: ${scopeOrder}`);
    logger.info(
      `🔍 TikTok Auth - Encoded scopes: ${encodeURIComponent(scopeOrder)}`
    );
    logger.info(`🔍 TikTok Auth - Using redirect URI: ${redirectUri}`);

    logger.info(`TikTok Auth - Generated URL: ${authUrl}`);

    // Check if user wants to force account selection
    const fromClearSession =
      req.headers.referer && req.headers.referer.includes("clear-session");

    // Check if this is a POST request (API call) or GET request (direct browser navigation)
    const isApiCall = req.method === "POST";

    if (forceAccountSelection && !fromClearSession && !isApiCall) {
      logger.info("TikTok Auth - Force account selection requested");

      // Return HTML that will clear TikTok cookies and then redirect
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Preparing TikTok Connection...</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 2rem;
              border-radius: 1rem;
              backdrop-filter: blur(10px);
              box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            }
            .spinner {
              border: 3px solid rgba(255,255,255,0.3);
              border-top: 3px solid white;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 1rem;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            h2 { margin: 0 0 0.5rem 0; }
            p { margin: 0; opacity: 0.8; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Preparing TikTok Connection</h2>
            <p>Clearing session data for account selection...</p>
          </div>
          
          <script>
            console.log("Starting TikTok session cleanup...");
            
            // Clear all cookies for current domain and TikTok domains
            function clearAllCookies() {
              const cookies = document.cookie.split(";");
              
              for (let cookie of cookies) {
                const eqPos = cookie.indexOf("=");
                const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                
                // Clear for multiple domain variations
                const domains = [
                  window.location.hostname,
                  '.' + window.location.hostname,
                  '.tiktok.com',
                  'tiktok.com',
                  '.tiktokcdn.com',
                  'tiktokcdn.com'
                ];
                
                const paths = ['/', '/auth', '/login'];
                
                domains.forEach(domain => {
                  paths.forEach(path => {
                    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=" + path + ";domain=" + domain;
                    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=" + path;
                  });
                });
              }
              console.log("Cookies cleared");
            }
            
            // Clear all storage
            function clearStorage() {
              try {
                localStorage.clear();
                sessionStorage.clear();
                
                // Clear IndexedDB if available
                if (window.indexedDB) {
                  indexedDB.databases().then(databases => {
                    databases.forEach(db => {
                      if (db.name && db.name.toLowerCase().includes('tiktok')) {
                        indexedDB.deleteDatabase(db.name);
                      }
                    });
                  }).catch(e => console.log("Could not clear IndexedDB:", e));
                }
                console.log("Storage cleared");
              } catch (e) {
                console.log("Could not clear storage:", e);
              }
            }
            
            // Execute cleanup
            clearAllCookies();
            clearStorage();
            
            // Open TikTok logout in hidden iframe to clear server-side session
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'https://www.tiktok.com/logout';
            document.body.appendChild(iframe);
            
            // Wait for logout to complete, then redirect to OAuth
            setTimeout(function() {
              console.log("Redirecting to TikTok OAuth...");
              window.location.replace("${authUrl}");
            }, 3000);
            
            // Fallback in case iframe doesn't load
            setTimeout(function() {
              if (window.location.href.includes('preparing')) {
                window.location.replace("${authUrl}");
              }
            }, 5000);
          </script>
        </body>
        </html>
      `;

      res.setHeader("Content-Type", "text/html");
      return res.send(generateSuccessHTML());
    }

    // If this is an API call, return JSON with the auth URL
    if (isApiCall) {
      logger.info("TikTok Auth - API call, returning JSON with auth URL");
      return res.status(200).json({
        status: "success",
        auth_url: authUrl,
      });
    }

    logger.info("TikTok Auth - Redirecting to TikTok OAuth");

    // Redirect directly to TikTok instead of returning JSON
    return res.redirect(authUrl);
  }
);

const handleCallback = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { code, state, error, scopes } = req.query;

    // Log all query parameters for debugging
    logger.info(
      "🔍 TikTok Callback - Full query params:",
      JSON.stringify(req.query, null, 2)
    );
    logger.info("🔍 TikTok Callback - Scopes granted:", scopes);

    // Set explicit CORS headers
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, Cache-Control"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (error) {
      logger.error("TikTok OAuth error:", error);
      return next(new CustomError("TikTok authentication failed", 400));
    }

    if (!code) {
      return next(new CustomError("Authorization code is required", 400));
    }

    // Extract code verifier and user token from state
    let codeVerifier = "";
    let userToken = "";

    try {
      if (state) {
        try {
          // Try the new JSON format first
          const decodedState = JSON.parse(
            Buffer.from(
              decodeURIComponent(state as string),
              "base64"
            ).toString()
          );
          codeVerifier = decodedState.codeVerifier || "";
          userToken = decodedState.userToken || "";
          logger.info("✅ Successfully parsed state as JSON");
        } catch (e) {
          // Fall back to the old format for backward compatibility
          logger.info("⚠️ Could not parse state as JSON, trying legacy format");
          const stateString = Buffer.from(
            state as string,
            "base64url"
          ).toString();
          const stateParts = stateString.split(":");
          if (stateParts.length >= 2) {
            codeVerifier = stateParts[1];
            userToken = stateParts[2] || "";
          }
        }
      }

      logger.info(
        `🔍 TikTok Callback - Extracted code verifier: ${
          codeVerifier ? "Found" : "Not found"
        }`
      );
      logger.info(
        `🔍 TikTok Callback - Extracted user token: ${
          userToken ? "Found" : "Not found"
        }`
      );
    } catch (error) {
      logger.error("❌ Error extracting data from state:", error);
    }

    // Check if we're in mock mode
    if (code === "MOCK_CODE_FOR_TESTING") {
      logger.info("TikTok Callback - Using mock data for testing");

      // Save mock TikTok profile to the database
      const mockTokenData = {
        access_token: "mock_access_token",
        refresh_token: "mock_refresh_token",
        expires_in: 86400
      };
      
      const mockUserInfo = {
        open_id: "mock_user_id",
        display_name: "Mock TikTok User",
        avatar_url: "",
        follower_count: 100,
        following_count: 50,
        likes_count: 1000,
        video_count: 10,
        is_verified: false,
      };
      
      try {
        await saveTikTokProfileToDatabase(userToken, mockTokenData, mockUserInfo, req);
      } catch (saveError: any) {
        logger.error("❌ Failed to save mock TikTok profile to database:", saveError);
        
        // Return error HTML instead of success
        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>TikTok Connection Error</title>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .container {
                background: rgba(255,255,255,0.1);
                padding: 2rem;
                border-radius: 1rem;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
              }
              .error-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h2>Connection Failed</h2>
              <p>Failed to save TikTok profile. Please try again.</p>
              <p><small>Error: ${saveError.message}</small></p>
            </div>
            <script>
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
          </body>
          </html>
        `;
        
        return res.send(generateErrorHTML(saveError.message));
      }

      // Return HTML that closes the popup and communicates success to parent window
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>TikTok Connected Successfully</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .container {
              background: rgba(255,255,255,0.1);
              padding: 2rem;
              border-radius: 1rem;
              backdrop-filter: blur(10px);
              box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            }
            .success-icon {
              font-size: 3rem;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h2>TikTok Connected Successfully!</h2>
            <p>This window will close automatically...</p>
          </div>
          <script>
            // Close the popup window after a short delay
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
        </html>
      `;
      
      return res.send(generateSuccessHTML());
    }

    try {
      // Real TikTok flow - Exchange code for access token with code verifier
      const tokenData = await tiktokService.exchangeCodeForToken(
        code as string,
        codeVerifier
      );

      logger.info("✅ TikTok token exchange successful");
      logger.info(
        `Token details: expires_in=${tokenData.expires_in}, scope=${tokenData.scope}`
      );

      // Try to get user info, but handle failure gracefully
      let userInfo = null;
      try {
        userInfo = await tiktokService.getUserInfo(tokenData.access_token);
        logger.info("✅ TikTok user info retrieved successfully");
        logger.info(`✅ User info: ${JSON.stringify(userInfo)}`);

        // Save the TikTok profile to the database
        try {
          await saveTikTokProfileToDatabase(userToken, tokenData, userInfo.data.user, req);
        } catch (saveError: any) {
          logger.error("❌ Failed to save TikTok profile to database:", saveError);
          
          // Return error HTML instead of success
          const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>TikTok Connection Error</title>
              <meta charset="utf-8">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  background: rgba(255,255,255,0.1);
                  padding: 2rem;
                  border-radius: 1rem;
                  backdrop-filter: blur(10px);
                  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                }
                .error-icon {
                  font-size: 3rem;
                  margin-bottom: 1rem;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="error-icon">❌</div>
                <h2>Connection Failed</h2>
                <p>Failed to save TikTok profile. Please try again.</p>
                <p><small>Error: ${saveError.message}</small></p>
              </div>
              <script>
                setTimeout(() => {
                  window.close();
                }, 3000);
              </script>
            </body>
            </html>
          `;
          
          return res.send(generateErrorHTML(saveError.message));
        }

        // Return HTML that closes the popup and communicates success to parent window
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>TikTok Connected Successfully</title>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .container {
                background: rgba(255,255,255,0.1);
                padding: 2rem;
                border-radius: 1rem;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
              }
              .success-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h2>TikTok Connected Successfully!</h2>
              <p>This window will close automatically...</p>
            </div>
            <script>
              // Close the popup window after a short delay
              setTimeout(() => {
                window.close();
              }, 1500);
            </script>
          </body>
          </html>
        `;
        
        return res.send(generateSuccessHTML());
      } catch (userInfoError) {
        logger.error(
          "❌ Failed to get user info, but token exchange was successful:",
          userInfoError
        );

        // Try basic user info with minimal scopes
        logger.info("🔄 Trying basic user info with minimal scopes...");
        try {
          userInfo = await tiktokService.getBasicUserInfo(
            tokenData.access_token
          );
          logger.info("✅ TikTok basic user info retrieved successfully");
          logger.info(`✅ Basic user info: ${JSON.stringify(userInfo)}`);

          // Save the TikTok profile to the database
          try {
            await saveTikTokProfileToDatabase(userToken, tokenData, userInfo.data.user, req);
          } catch (saveError: any) {
            logger.error("❌ Failed to save TikTok profile to database:", saveError);
            
            // Return error HTML instead of success
            const errorHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <title>TikTok Connection Error</title>
                <meta charset="utf-8">
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
                    color: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                  }
                  .container {
                    background: rgba(255,255,255,0.1);
                    padding: 2rem;
                    border-radius: 1rem;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                  }
                  .error-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="error-icon">❌</div>
                  <h2>Connection Failed</h2>
                  <p>Failed to save TikTok profile. Please try again.</p>
                  <p><small>Error: ${saveError.message}</small></p>
                </div>
                <script>
                  setTimeout(() => {
                    window.close();
                  }, 3000);
                </script>
              </body>
              </html>
            `;
            
            return res.send(generateErrorHTML(saveError.message));
          }

          // Return HTML that closes the popup and communicates success to parent window
          const htmlResponse = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>TikTok Connected Successfully</title>
              <meta charset="utf-8">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  background: rgba(255,255,255,0.1);
                  padding: 2rem;
                  border-radius: 1rem;
                  backdrop-filter: blur(10px);
                  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                }
                .success-icon {
                  font-size: 3rem;
                  margin-bottom: 1rem;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="success-icon">✅</div>
                <h2>TikTok Connected Successfully!</h2>
                <p>This window will close automatically...</p>
              </div>
              <script>
                // Close the popup window after a short delay
                setTimeout(() => {
                  window.close();
                }, 1500);
              </script>
            </body>
            </html>
          `;
          
          return res.send(generateSuccessHTML());
        } catch (basicUserInfoError) {
          logger.error(
            "❌ Failed to get basic user info as well:",
            basicUserInfoError
          );
        }

        // Create minimal user info with open_id from token response
        // TikTok access tokens contain user ID in the format: act.XXXX!YYYY.va
        // where YYYY is the user ID
        const tokenParts = tokenData.access_token.split("!");
        const tikTokUserId =
          tokenParts.length > 1
            ? tokenParts[1].split(".")[0]
            : `unknown-${Date.now()}`;

        const minimalUserInfo = {
          open_id: tikTokUserId,
          display_name: "TikTok User",
          avatar_url: "",
          follower_count: 0,
          following_count: 0,
          likes_count: 0,
          video_count: 0,
          is_verified: false,
        };

        logger.info(
          "📝 Created minimal user info from token:",
          minimalUserInfo
        );

        // Save the TikTok profile to the database
        try {
          await saveTikTokProfileToDatabase(userToken, tokenData, minimalUserInfo, req);
        } catch (saveError: any) {
          logger.error("❌ Failed to save TikTok profile to database:", saveError);
          
          // Return error HTML instead of success
          const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>TikTok Connection Error</title>
              <meta charset="utf-8">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  background: rgba(255,255,255,0.1);
                  padding: 2rem;
                  border-radius: 1rem;
                  backdrop-filter: blur(10px);
                  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                }
                .error-icon {
                  font-size: 3rem;
                  margin-bottom: 1rem;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="error-icon">❌</div>
                <h2>Connection Failed</h2>
                <p>Failed to save TikTok profile. Please try again.</p>
                <p><small>Error: ${saveError.message}</small></p>
              </div>
              <script>
                setTimeout(() => {
                  window.close();
                }, 3000);
              </script>
            </body>
            </html>
          `;
          
          return res.send(generateErrorHTML(saveError.message));
        }

        // Return HTML that closes the popup and communicates success to parent window
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>TikTok Connected Successfully</title>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .container {
                background: rgba(255,255,255,0.1);
                padding: 2rem;
                border-radius: 1rem;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
              }
              .success-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h2>TikTok Connected Successfully!</h2>
              <p>This window will close automatically...</p>
            </div>
            <script>
              // Close the popup window after a short delay
              setTimeout(() => {
                window.close();
              }, 1500);
            </script>
          </body>
          </html>
        `;
        
        return res.send(generateSuccessHTML());
      }
    } catch (error) {
      logger.error("TikTok callback error:", error);
      return next(
        new CustomError("Failed to complete TikTok authentication", 500)
      );
    }
  }
);

const saveTikTokProfile = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { accessToken, refreshToken, userInfo } = req.body;

    logger.info(
      "🔍 saveTikTokProfile - Request body:",
      JSON.stringify(req.body, null, 2)
    );
    logger.info("🔍 saveTikTokProfile - User:", req.user?.id);

    if (!accessToken) {
      return next(new CustomError("Access token is required", 400));
    }

    if (!userInfo) {
      return next(new CustomError("User info is required", 400));
    }

    if (!refreshToken) {
      return next(new CustomError("Refresh token is required", 400));
    }

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    try {
      // Check if profile already exists
      logger.info("🔍 Checking for existing TikTok profile...");
      const existingProfile = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .single();

      logger.info("🔍 Existing profile result:", existingProfile);

      // Extract TikTok user ID from token if not provided in userInfo
      let tikTokUserId = userInfo.open_id;
      if (!tikTokUserId) {
        // TikTok access tokens contain user ID in the format: act.XXXX!YYYY.va
        // where YYYY is the user ID
        const tokenParts = accessToken.split("!");
        tikTokUserId =
          tokenParts.length > 1
            ? tokenParts[1].split(".")[0]
            : `unknown-${Date.now()}`;
        logger.info(`🔍 Extracted TikTok user ID from token: ${tikTokUserId}`);
      }

      // Use a placeholder username if not provided
      const username =
        userInfo.display_name || `tiktok_user_${tikTokUserId.substring(0, 8)}`;

      const profileData = {
        user_id: req.user.id,
        tiktok_user_id: tikTokUserId,
        username: username, // TikTok doesn't provide username directly
        display_name: userInfo.display_name || username,
        avatar_url: userInfo.avatar_url || "",
        follower_count: userInfo.follower_count || 0,
        following_count: userInfo.following_count || 0,
        likes_count: userInfo.likes_count || 0,
        video_count: userInfo.video_count || 0,
        access_token: accessToken,
        refresh_token: refreshToken,
        is_verified: userInfo.is_verified || false,
        token_expires_at: new Date(
          Date.now() + 23.5 * 60 * 60 * 1000 // ~23.5h safety margin
        ).toISOString(), // 24 hours from now
      };

      logger.info(
        "🔍 Profile data to save:",
        JSON.stringify(profileData, null, 2)
      );

      if (existingProfile.error && existingProfile.error.code !== "PGRST116") {
        throw existingProfile.error;
      }

      let result;
      if (existingProfile.data) {
        // Update existing profile
        logger.info("🔄 Updating existing TikTok profile...");
        result = await supabase
          .from("tiktok_profiles")
          .update(profileData)
          .eq("user_id", req.user.id)
          .select()
          .single();
      } else {
        // Insert new profile
        logger.info("➕ Inserting new TikTok profile...");
        result = await supabase
          .from("tiktok_profiles")
          .insert(profileData)
          .select()
          .single();
      }

      logger.info(
        "🔍 Database operation result:",
        JSON.stringify(result, null, 2)
      );

      if (result.error) {
        logger.error("❌ Database operation failed:", result.error);
        throw result.error;
      }

      logger.info("✅ TikTok profile saved successfully:", result.data);

      return res.status(200).json({
        status: "success",
        data: {
          profile: result.data,
        },
      });
    } catch (error) {
      logger.error("Save TikTok profile error:", error);
      return next(new CustomError("Failed to save TikTok profile", 500));
    }
  }
);

const getUserProfile = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    try {
      // Get profile from database
      const { data: profile, error } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (!profile) {
        return next(new CustomError("TikTok profile not found", 404));
      }

      return res.status(200).json({
        status: "success",
        data: {
          profile,
        },
      });
    } catch (error) {
      logger.error("Get TikTok profile error:", error);
      return next(new CustomError("Failed to fetch TikTok profile", 500));
    }
  }
);

const getUserVideos = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { cursor, maxCount = 20 } = req.query;

    logger.info(
      `🔍 getUserVideos - User: ${req.user?.id}, cursor: ${cursor}, maxCount: ${maxCount}`
    );

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    // Set explicit CORS headers
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, Cache-Control"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    try {
      // Get TikTok profile from database
      logger.info(`🔍 Getting TikTok profile for user: ${req.user.id}`);
      const { data: tikTokProfile, error } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .single();

      logger.info(`🔍 TikTok profile result:`, { data: tikTokProfile, error });

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (!tikTokProfile || !tikTokProfile.access_token) {
        logger.error(
          `❌ TikTok profile not found or no access token for user: ${req.user.id}`
        );
        return next(new CustomError("TikTok profile not connected", 404));
      }

      const tiktokAccessToken = tikTokProfile.access_token;
      let accessTokenToUse = tiktokAccessToken;

      // Auto-refresh token if expired or close to expiry (within 5 minutes)
      try {
        const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
        const expiresAt = tikTokProfile.token_expires_at
          ? new Date(tikTokProfile.token_expires_at).getTime()
          : 0;

        if (
          Date.now() + TOKEN_BUFFER_MS > expiresAt &&
          tikTokProfile.refresh_token
        ) {
          logger.info("🔄 TikTok access token expired/expiring, refreshing...");
          const refreshed = await tiktokService.refreshAccessToken(
            tikTokProfile.refresh_token
          );

          accessTokenToUse = refreshed.access_token;

          // Update DB with new tokens
          await supabase
            .from("tiktok_profiles")
            .update({
              access_token: refreshed.access_token,
              refresh_token:
                refreshed.refresh_token || tikTokProfile.refresh_token,
              token_expires_at: new Date(
                Date.now() + refreshed.expires_in * 1000
              ).toISOString(),
            })
            .eq("user_id", req.user.id);

          logger.info("✅ TikTok token refreshed and database updated");
        }
      } catch (refreshErr) {
        logger.error("❌ Failed to refresh TikTok token:", refreshErr);
      }

      logger.info(
        `🔍 Using TikTok access token: ${accessTokenToUse.substring(0, 20)}...`
      );

      // Check if we're in mock mode
      if (tiktokAccessToken === "mock_access_token_for_testing") {
        logger.info("✅ TikTok Videos - Using mock data for testing");

        // Return mock videos data
        return res.status(200).json({
          status: "success",
          data: {
            videos: [
              {
                id: "mock_video_1",
                title: "My First TikTok Video",
                cover_image_url:
                  "https://placehold.co/400x600?text=TikTok+Video+1",
                share_url: "https://www.tiktok.com/@mockuser/video/1",
                video_description: "This is a mock video for testing purposes",
                create_time: new Date().toISOString(),
                view_count: 1543,
                like_count: 120,
                comment_count: 14,
                share_count: 5,
              },
              {
                id: "mock_video_2",
                title: "Dancing Challenge",
                cover_image_url:
                  "https://placehold.co/400x600?text=TikTok+Video+2",
                share_url: "https://www.tiktok.com/@mockuser/video/2",
                video_description:
                  "Check out my new dance moves! #dance #challenge",
                create_time: new Date(Date.now() - 86400000).toISOString(),
                view_count: 4231,
                like_count: 532,
                comment_count: 48,
                share_count: 12,
              },
              {
                id: "mock_video_3",
                title: "Cooking Tutorial",
                cover_image_url:
                  "https://placehold.co/400x600?text=TikTok+Video+3",
                share_url: "https://www.tiktok.com/@mockuser/video/3",
                video_description:
                  "How to make the perfect pancakes #cooking #food",
                create_time: new Date(Date.now() - 172800000).toISOString(),
                view_count: 8765,
                like_count: 976,
                comment_count: 103,
                share_count: 45,
              },
            ],
            cursor: "mock_next_cursor",
            has_more: false,
          },
        });
      }

      logger.info(`🔍 Calling TikTok API to get user videos...`);
      try {
        const videos = await tiktokService.getUserVideos(
          accessTokenToUse,
          cursor as string,
          parseInt(maxCount as string)
        );

        logger.info(
          `✅ Successfully retrieved ${
            videos.data?.videos?.length || 0
          } videos from TikTok API`
        );

        res.status(200).json({
          status: "success",
          data: videos,
        });
      } catch (videoError: any) {
        // If unauthorized, attempt one more refresh + retry
        if (
          (videoError.response && videoError.response.status === 401) ||
          (videoError.message &&
            videoError.message.includes("access token is invalid"))
        ) {
          logger.warn("⚠️ TikTok token invalid, attempting refresh and retry");
          try {
            if (tikTokProfile.refresh_token) {
              const refreshed = await tiktokService.refreshAccessToken(
                tikTokProfile.refresh_token
              );
              accessTokenToUse = refreshed.access_token;

              // Update DB
              await supabase
                .from("tiktok_profiles")
                .update({
                  access_token: refreshed.access_token,
                  refresh_token:
                    refreshed.refresh_token || tikTokProfile.refresh_token,
                  token_expires_at: new Date(
                    Date.now() + refreshed.expires_in * 1000
                  ).toISOString(),
                })
                .eq("user_id", req.user.id);

              const retryVideos = await tiktokService.getUserVideos(
                accessTokenToUse,
                cursor as string,
                parseInt(maxCount as string)
              );

              return res.status(200).json({
                status: "success",
                data: retryVideos,
              });
            }
          } catch (retryErr) {
            logger.error("❌ Retry after refresh failed:", retryErr);
          }
        }

        // Check for permission errors
        if (
          videoError.message &&
          (videoError.message.includes("permission not granted") ||
            videoError.message.includes("VIDEO_PERMISSION_DENIED"))
        ) {
          return res.status(403).json({
            status: "error",
            // message:
            //   "TikTok video access permission not granted. Please reconnect your TikTok account with video permissions.",
            message: videoError.message,
            error_code: "PERMISSION_DENIED",
            data: {
              videos: [],
              cursor: null,
              has_more: false,
            },
          });
        }

        // For other errors, return a generic error
        return res.status(500).json({
          status: "error",
          message:
            "Failed to fetch TikTok videos. This might be due to TikTok API permissions or your videos being private.",
          data: {
            videos: [],
            cursor: null,
            has_more: false,
          },
        });
      }
    } catch (error) {
      logger.error("Get TikTok videos error:", error);
      return next(new CustomError("Failed to fetch TikTok videos", 500));
    }
  }
);

const uploadVideo = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { tiktokAccessToken, videoData } = req.body;

    if (!tiktokAccessToken || !videoData) {
      return next(
        new CustomError("TikTok access token and video data are required", 400)
      );
    }

    try {
      const result = await tiktokService.uploadVideo(
        tiktokAccessToken,
        videoData
      );

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      logger.error("Upload TikTok video error:", error);
      return next(new CustomError("Failed to upload video to TikTok", 500));
    }
  }
);

const getVideoDetails = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { videoId } = req.params;
    const { tiktokAccessToken } = req.body;

    if (!tiktokAccessToken) {
      return next(new CustomError("TikTok access token is required", 400));
    }

    try {
      const videoDetails = await tiktokService.getVideoDetails(
        tiktokAccessToken,
        videoId
      );

      res.status(200).json({
        status: "success",
        data: {
          video: videoDetails,
        },
      });
    } catch (error) {
      logger.error("Get TikTok video details error:", error);
      return next(new CustomError("Failed to fetch video details", 500));
    }
  }
);

const getContestVideos = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { hashtag, count = 50 } = req.query;

    if (!hashtag) {
      return next(new CustomError("Hashtag is required", 400));
    }

    try {
      const videos = await tiktokService.searchVideosByHashtag(
        hashtag as string,
        parseInt(count as string)
      );

      res.status(200).json({
        status: "success",
        data: {
          videos,
        },
      });
    } catch (error) {
      logger.error("Get contest videos error:", error);
      return next(new CustomError("Failed to fetch contest videos", 500));
    }
  }
);

const scrapeVideoData = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return next(new CustomError("Video URL is required", 400));
    }

    try {
      const videoData = await tiktokService.scrapeVideoData(videoUrl);

      res.status(200).json({
        status: "success",
        data: {
          video: videoData,
        },
      });
    } catch (error) {
      logger.error("Scrape video data error:", error);
      return next(new CustomError("Failed to scrape video data", 500));
    }
  }
);

const updateRedirectUri = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { redirectUri } = req.body;

    if (!redirectUri) {
      return next(new CustomError("Redirect URI is required", 400));
    }

    // Update the config
    config.tiktok.redirectUri = redirectUri;

    logger.info(`TikTok redirect URI updated to: ${redirectUri}`);

    // Generate a new auth URL with the updated redirect URI
    const csrfState = Math.random().toString(36).substring(2);

    // Generate PKCE code verifier and challenge
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Store code verifier in state
    const stateWithVerifier = `${csrfState}:${codeVerifier}`;
    const encodedState = Buffer.from(stateWithVerifier).toString("base64url");

    // Normal flow with actual TikTok credentials
    let authUrl = "https://www.tiktok.com/v2/auth/authorize/";
    authUrl += `?client_key=${config.tiktok.clientKey}`;
    authUrl += "&scope=user.info.basic,video.list";
    authUrl += "&response_type=code";
    authUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    authUrl += `&state=${encodedState}`;
    authUrl += `&code_challenge=${codeChallenge}`;
    authUrl += "&code_challenge_method=S256";

    return res.status(200).json({
      status: "success",
      data: {
        redirectUri,
        authUrl,
      },
    });
  }
);

const disconnectTikTokProfile = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 disconnectTikTokProfile - Request received");
    logger.info("🔍 disconnectTikTokProfile - User:", req.user?.id);

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    try {
      // Check if profile exists
      logger.info("🔍 Checking for existing TikTok profile...");
      const { data: profile, error: fetchError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        logger.error("❌ Error fetching TikTok profile:", fetchError);
        throw fetchError;
      }

      if (!profile) {
        logger.info("⚠️ No TikTok profile found to disconnect");
        return res.status(404).json({
          status: "error",
          message: "No TikTok profile found to disconnect",
        });
      }

      // Delete the profile
      logger.info("🗑️ Deleting TikTok profile...");
      const { error: deleteError } = await supabase
        .from("tiktok_profiles")
        .delete()
        .eq("user_id", req.user.id);

      if (deleteError) {
        logger.error("❌ Error deleting TikTok profile:", deleteError);
        throw deleteError;
      }

      logger.info("✅ TikTok profile disconnected successfully");
      return res.status(200).json({
        status: "success",
        message: "TikTok profile disconnected successfully",
      });
    } catch (error) {
      logger.error("❌ Disconnect TikTok profile error:", error);
      return next(new CustomError("Failed to disconnect TikTok profile", 500));
    }
  }
);

// Helper function to generate success HTML
function generateSuccessHTML() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>TikTok Connected Successfully</title>
      <meta charset="utf-8">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 2rem;
          border-radius: 1rem;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .success-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✅</div>
        <h2>TikTok Connected Successfully!</h2>
        <p>This window will close automatically...</p>
      </div>
      <script src="/tiktok-success.js"></script>
    </body>
    </html>
  `;
}

// Helper function to generate error HTML
function generateErrorHTML(errorMessage: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>TikTok Connection Error</title>
      <meta charset="utf-8">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 2rem;
          border-radius: 1rem;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .error-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error-icon">❌</div>
        <h2>Connection Failed</h2>
        <p>${errorMessage}</p>
        <p><small>This window will close automatically...</small></p>
      </div>
      <script src="/tiktok-error.js"></script>
    </body>
    </html>
  `;
}

// Helper function to save TikTok profile to database
async function saveTikTokProfileToDatabase(userToken: string, tokenData: any, userInfo: any, req?: any) {
  try {
    logger.info("💾 Saving TikTok profile to database...");
    logger.info(`🔍 User token received: ${userToken ? 'Present' : 'Empty'}`);
    
    let userId = null;
    
    // Try to get user ID from token first
    if (userToken && userToken.trim() !== '') {
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.decode(userToken);
        userId = decoded?.sub;
        logger.info(`🔍 Decoded JWT - User ID: ${userId}`);
      } catch (jwtError) {
        logger.error("❌ Failed to decode JWT token:", jwtError);
      }
    }
    
    // If no user ID from token, try to get it from request session/cookies
    if (!userId && req) {
      // Check if there's an Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.decode(token);
          userId = decoded?.sub;
          logger.info(`🔍 Found user ID from Authorization header: ${userId}`);
        } catch (e) {
          logger.warn("❌ Failed to decode Authorization header token");
        }
      }
    }
    
    // If still no user ID, this means TikTok auth was initiated without a logged-in user
    if (!userId) {
      logger.error("❌ No authenticated user found - TikTok connection requires a logged-in user");
      throw new Error("You must be logged in to connect your TikTok account. Please log in first and try again.");
    }
    
    // Extract TikTok user ID from access token
    let tikTokUserId = userInfo.open_id;
    if (!tikTokUserId) {
      // TikTok access tokens contain user ID in the format: act.XXXX!YYYY.va
      // where YYYY is the user ID
      const tokenParts = tokenData.access_token.split("!");
      tikTokUserId = tokenParts.length > 1 ? tokenParts[1].split(".")[0] : `unknown-${Date.now()}`;
      logger.info(`🔍 Extracted TikTok user ID from token: ${tikTokUserId}`);
    }
    
    // Use a placeholder username if not provided
    const username = userInfo.display_name || `tiktok_user_${tikTokUserId.substring(0, 8)}`;
    
    const profileData = {
      user_id: userId,
      tiktok_user_id: tikTokUserId,
      username: username,
      display_name: userInfo.display_name || username,
      avatar_url: userInfo.avatar_url || "",
      follower_count: userInfo.follower_count || 0,
      following_count: userInfo.following_count || 0,
      likes_count: userInfo.likes_count || 0,
      video_count: userInfo.video_count || 0,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      is_verified: userInfo.is_verified || false,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    };
    
    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from("tiktok_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    
    let result;
    if (existingProfile) {
      // Update existing profile
      logger.info("🔄 Updating existing TikTok profile...");
      result = await supabase
        .from("tiktok_profiles")
        .update(profileData)
        .eq("user_id", userId)
        .select()
        .single();
    } else {
      // Insert new profile
      logger.info("➕ Inserting new TikTok profile...");
      result = await supabase
        .from("tiktok_profiles")
        .insert(profileData)
        .select()
        .single();
    }
    
    if (result.error) {
      logger.error("❌ Database operation failed:", result.error);
      throw result.error;
    }
    
    logger.info("✅ TikTok profile saved successfully:", result.data);
    return result.data;
  } catch (error) {
    logger.error("❌ Error saving TikTok profile:", error);
    throw error;
  }
}

export const tiktokController = {
  clearTikTokSession,
  initiateAuth,
  handleCallback,
  saveTikTokProfile,
  getUserProfile,
  getUserVideos,
  uploadVideo,
  getVideoDetails,
  getContestVideos,
  scrapeVideoData,
  updateRedirectUri,
  disconnectTikTokProfile,
};
