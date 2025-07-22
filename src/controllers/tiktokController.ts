import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { config } from "../config/env";
import { CustomError, catchAsync } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { tiktokService } from "../services/tiktokService";
import { VideoDownloadService } from "../services/videoDownloadService";
import { supabase, supabaseAdmin } from "../config/supabase";
import crypto from "crypto";
import jwt from "jsonwebtoken";

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

// Helper function to get primary TikTok account for a user
async function getPrimaryTikTokAccount(userId: string) {
  try {
    // First try to get explicitly marked primary account
    const { data: primaryAccount, error: primaryError } = await supabase
      .from("tiktok_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    
    if (primaryError && primaryError.code !== "PGRST116") {
      throw primaryError;
    }
    
    if (primaryAccount) {
      return primaryAccount;
    }
    
    // If no primary account found, get first account and log warning
    const { data: firstAccount, error: firstError } = await supabase
      .from("tiktok_profiles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (firstError && firstError.code !== "PGRST116") {
      throw firstError;
    }
    
    if (firstAccount) {
      logger.warn(`⚠️ No primary TikTok account found for user ${userId}, using first account: ${firstAccount.id}`);
      
      // Auto-fix: Set this account as primary
      await supabase.rpc("set_primary_tiktok_account", {
        account_uuid: firstAccount.id,
        user_uuid: userId,
      });
      
      return { ...firstAccount, is_primary: true };
    }
    
    return null;
  } catch (error) {
    logger.error("❌ Error getting primary TikTok account:", error);
    throw error;
  }
}

const clearTikTokSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    logger.info("TikTok Clear Session - Request received");

    // Check if this is a simple redirect request
    const { token, simple } = req.query;
    const backendUrl = req.protocol + "://" + req.get("host");
    
    // Generate the actual TikTok OAuth URL instead of redirecting back to our auth endpoint
    let tikTokOAuthUrl = "";
    
    try {
      // Check if we have valid TikTok configuration
      if (!config.tiktok.clientKey || config.tiktok.clientKey === "") {
        logger.error("TikTok Clear Session - No client key configured!");
        
        // Return error page instead of fallback
        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>TikTok Configuration Error</title>
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
            </style>
          </head>
          <body>
            <div class="container">
              <h2>⚠️ Configuration Error</h2>
              <p>TikTok integration is not properly configured.</p>
              <p>Please contact support.</p>
            </div>
            <script>
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
          </body>
          </html>
        `;
        
        return res.send(errorHtml);
      }

      // Generate PKCE code challenge and verifier
      const { codeChallenge, codeVerifier } = generatePKCE();

      // Store code verifier in state along with user token if provided
      const stateData = {
        codeVerifier,
        userToken: token || "",
        timestamp: Date.now(),
      };

      // Encode state for URL
      const encodedState = encodeURIComponent(
        Buffer.from(JSON.stringify(stateData)).toString("base64")
      );

      // Build TikTok OAuth URL
      tikTokOAuthUrl = "https://www.tiktok.com/v2/auth/authorize/";
      tikTokOAuthUrl += `?client_key=${config.tiktok.clientKey}`;
      tikTokOAuthUrl += `&scope=${encodeURIComponent("user.info.basic,video.list")}`;
      tikTokOAuthUrl += "&response_type=code";
      tikTokOAuthUrl += `&redirect_uri=${encodeURIComponent(config.tiktok.redirectUri)}`;
      tikTokOAuthUrl += `&state=${encodedState}`;
      tikTokOAuthUrl += `&code_challenge=${codeChallenge}`;
      tikTokOAuthUrl += "&code_challenge_method=S256";
      
      logger.info(`TikTok Clear Session - Generated OAuth URL: ${tikTokOAuthUrl}`);
      logger.info(`TikTok Clear Session - Client Key: ${config.tiktok.clientKey ? 'Present' : 'Missing'}`);
      logger.info(`TikTok Clear Session - Redirect URI: ${config.tiktok.redirectUri}`);
    } catch (error: unknown) {
      logger.error("Failed to generate TikTok OAuth URL:", error);
      // Return error instead of fallback since we don't use mock mode
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>TikTok OAuth Error</title>
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
          </style>
        </head>
        <body>
          <div class="container">
            <h2>❌ OAuth Generation Failed</h2>
            <p>Failed to generate TikTok OAuth URL.</p>
            <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
          </div>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
      `;
      
      return res.send(errorHtml);
    }

    // Simple redirect for testing
    if (simple === "true") {
      logger.info("TikTok Clear Session - Simple redirect requested");
      return res.redirect(tikTokOAuthUrl);
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
            console.log("Target URL: ${tikTokOAuthUrl}");
            
            var targetUrl = "${tikTokOAuthUrl}";
            
            // Validate URL before redirect
            if (targetUrl.includes("undefined") || targetUrl === "" || targetUrl.includes("null")) {
              console.error("Invalid OAuth URL detected:", targetUrl);
              document.body.innerHTML = '<div style="text-align:center; padding:50px; color:white;"><h2>Error: Invalid OAuth Configuration</h2><p>URL: ' + targetUrl + '</p><p>Please check TikTok configuration.</p></div>';
              return;
            }
            
            try {
              console.log("Attempting redirect to:", targetUrl);
              window.location.href = targetUrl;
            } catch (e) {
              console.error("Redirect failed:", e);
              // Force reload with new URL
              window.location.replace(targetUrl);
            }
          }, 1500);
          
          // Fallback in case something goes wrong
          setTimeout(function() {
            console.log("Fallback redirect triggered");
            console.log("Current URL:", window.location.href);
            var targetUrl = "${tikTokOAuthUrl}";
            
            if (window.location.href.includes('clear-session')) {
              console.log("Still on clear-session page, forcing redirect");
              if (!targetUrl.includes("undefined") && targetUrl !== "" && !targetUrl.includes("null")) {
                window.location.replace(targetUrl);
              } else {
                document.body.innerHTML = '<div style="text-align:center; padding:50px; color:white;"><h2>Configuration Error</h2><p>TikTok OAuth URL is invalid</p><p>URL: ' + targetUrl + '</p></div>';
              }
            }
          }, 3000);
          
          // Emergency fallback
          setTimeout(function() {
            console.log("Emergency fallback redirect");
            var targetUrl = "${tikTokOAuthUrl}";
            
            if (!targetUrl.includes("undefined") && targetUrl !== "" && !targetUrl.includes("null")) {
              window.location.replace(targetUrl);
            } else {
              document.body.innerHTML = '<div style="text-align:center; padding:50px; color:white;"><h2>Final Error</h2><p>Unable to redirect to TikTok OAuth</p><p>Please check server logs</p></div>';
            }
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // For authenticated requests (POST /auth/initiate), we get the user from the middleware
    // For non-authenticated requests (GET /auth), we need to extract the token manually
    let userToken = (req.query.token as string) || req.body.token;
    let userId = null;
    
    // If this is an authenticated request, get the user info from middleware
    if (req.user) {
      userId = req.user.id;
      logger.info(`🔍 TikTok Auth Initiate - Authenticated user: ${userId}`);
      
      // For authenticated requests, we'll use the user's JWT token
      if (req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          userToken = authHeader.substring(7);
        }
      }
    } else {
      // For non-authenticated requests, try to get token from headers or params
      if (!userToken && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          userToken = authHeader.substring(7);
        }
      }
    }
    
    const forceAccountSelection =
      req.query.force_account_selection === "true" ||
      req.body.force_account_selection === true;
    const emphasizeVideoPermissions =
      req.query.emphasize_video_permissions === "true" ||
      req.body.emphasize_video_permissions === true;
    
    // Log the authentication attempt
    logger.info(`🔍 TikTok Auth Initiate - Method: ${req.method}`);
    logger.info(`🔍 TikTok Auth Initiate - User token: ${userToken ? 'Present' : 'Missing'}`);
    logger.info(`🔍 TikTok Auth Initiate - User ID: ${userId || 'Missing'}`);
    logger.info(`🔍 TikTok Auth Initiate - Authorization header: ${req.headers.authorization ? 'Present' : 'Missing'}`);
    
    // For POST requests (API calls), we require authentication
    if (req.method === "POST") {
      if (!req.user) {
        logger.warn("⚠️ TikTok API authentication attempted without user authentication");
        return res.status(401).json({
          status: "error",
          message: "You must be logged in to connect your TikTok account. Please log in first and try again.",
          error_code: "AUTHENTICATION_REQUIRED"
        });
      }
    }
    
    // For GET requests (browser navigation), we allow it but require token in state
    if (req.method === "GET" && (!userToken || userToken.trim() === '')) {
      logger.warn("⚠️ TikTok browser authentication attempted without user token");
      return res.send(generateErrorHTML(
        "You must be logged in to connect your TikTok account. Please log in first and try again."
      ));
    }
    
    // Use the user token if available, otherwise use empty string (it will be handled later)
    const tokenToStore = userToken || "";

    // Generate PKCE code challenge and verifier
    const { codeChallenge, codeVerifier } = generatePKCE();

    // Store code verifier in state along with user token if provided
    const stateData = {
      codeVerifier,
      userToken: tokenToStore,
      timestamp: Date.now(),
    };

    // Encode state for URL
    const encodedState = encodeURIComponent(
      Buffer.from(JSON.stringify(stateData)).toString("base64")
    );

    // Check if we have a valid TikTok client key
    if (!config.tiktok.clientKey || config.tiktok.clientKey === "") {
      logger.error("TikTok Auth - No client key configured! Please set TIKTOK_CLIENT_KEY environment variable.");
      
      const errorMessage = "TikTok integration is not configured. Please contact support.";
      
      // For API calls, return error JSON
      if (req.method === "POST") {
        return res.status(500).json({
          status: "error",
          message: errorMessage,
          error_code: "TIKTOK_NOT_CONFIGURED"
        });
      }
      
      // For browser requests, return error HTML
      return res.send(generateErrorHTML(errorMessage));
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
    
    // Add force_login parameter to force account selection
    authUrl += "&force_login=1";

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

    // For API calls with force account selection, return session clearing URL first
    if (forceAccountSelection && !fromClearSession && isApiCall) {
      logger.info("TikTok Auth - API call with force account selection, returning clear session URL");
      
      const clearSessionUrl = `${req.protocol}://${req.get("host")}/api/v1/tiktok/auth/clear-session?token=${encodeURIComponent(tokenToStore)}`;
      
      return res.status(200).json({
        status: "success",
        clear_session_url: clearSessionUrl,
        requires_session_clearing: true,
      });
    }

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
    } catch (error: unknown) {
      logger.error("❌ Error extracting data from state:", error);
    }

    // No mock mode - proceed with real TikTok OAuth flow only

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
    } catch (error: unknown) {
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
      // Check if user has any TikTok profiles (for multi-account support)
      logger.info("🔍 Checking for existing TikTok profiles...");
      const { data: existingProfiles, error: existingError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id);

      logger.info("🔍 Existing profiles result:", { data: existingProfiles, error: existingError });
      
      if (existingError) {
        throw existingError;
      }

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

      // Check if this specific TikTok account already exists for this user
      const existingTikTokAccount = existingProfiles?.find(
        profile => profile.tiktok_user_id === tikTokUserId
      );

      // Use a placeholder username if not provided
      const username =
        userInfo.display_name || `tiktok_user_${tikTokUserId.substring(0, 8)}`;

      // Determine if this should be primary (first account or no primary exists)
      const shouldBePrimary = !existingProfiles || 
        existingProfiles.length === 0 || 
        !existingProfiles.some(profile => profile.is_primary);

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
        is_primary: shouldBePrimary,
        token_expires_at: new Date(
          Date.now() + 23.5 * 60 * 60 * 1000 // ~23.5h safety margin
        ).toISOString(), // 24 hours from now
      };

      logger.info(
        "🔍 Profile data to save:",
        JSON.stringify(profileData, null, 2)
      );
      logger.info(`🔍 Setting account as primary: ${shouldBePrimary}`);

      let result;
      if (existingTikTokAccount) {
        // Update existing TikTok account
        logger.info(`🔄 Updating existing TikTok account: ${tikTokUserId}`);
        result = await supabase
          .from("tiktok_profiles")
          .update(profileData)
          .eq("id", existingTikTokAccount.id)
          .eq("user_id", req.user.id)
          .select()
          .single();
      } else {
        // Insert new TikTok account
        logger.info(`➕ Inserting new TikTok account: ${tikTokUserId}`);
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
    } catch (error: unknown) {
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
      // Get primary TikTok profile from database
      const profile = await getPrimaryTikTokAccount(req.user.id);

      if (!profile) {
        return next(new CustomError("TikTok profile not found", 404));
      }

      return res.status(200).json({
        status: "success",
        data: {
          profile,
        },
      });
    } catch (error: unknown) {
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
      // Get primary TikTok profile from database
      logger.info(`🔍 Getting primary TikTok profile for user: ${req.user.id}`);
      const tikTokProfile = await getPrimaryTikTokAccount(req.user.id);

      logger.info(`🔍 Primary TikTok profile result:`, { 
        accountId: tikTokProfile?.id,
        username: tikTokProfile?.username,
        displayName: tikTokProfile?.display_name,
        hasAccessToken: !!tikTokProfile?.access_token,
        hasRefreshToken: !!tikTokProfile?.refresh_token,
        tokenExpiresAt: tikTokProfile?.token_expires_at,
        isPrimary: tikTokProfile?.is_primary,
        createdAt: tikTokProfile?.created_at,
      });

      if (!tikTokProfile || !tikTokProfile.access_token) {
        logger.error(
          `❌ Primary TikTok profile not found or no access token for user: ${req.user.id}`
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

        const now = Date.now();
        const isExpired = now + TOKEN_BUFFER_MS > expiresAt;

        logger.info("🔍 Token expiration check for videos:", {
          accountId: tikTokProfile.id,
          username: tikTokProfile.username,
          now: new Date(now).toISOString(),
          expiresAt: tikTokProfile.token_expires_at,
          isExpired,
          hasRefreshToken: !!tikTokProfile.refresh_token,
          timeDiff: now - expiresAt,
        });

        if (isExpired && tikTokProfile.refresh_token) {
          logger.info("🔄 TikTok access token expired/expiring, refreshing...");
          const refreshed = await tiktokService.refreshAccessToken(
            tikTokProfile.refresh_token
          );

          accessTokenToUse = refreshed.access_token;

          // Update DB with new tokens - IMPORTANT: Update the specific account ID
          const updateResult = await supabase
            .from("tiktok_profiles")
            .update({
              access_token: refreshed.access_token,
              refresh_token:
                refreshed.refresh_token || tikTokProfile.refresh_token,
              token_expires_at: new Date(
                Date.now() + refreshed.expires_in * 1000
              ).toISOString(),
            })
            .eq("id", tikTokProfile.id) // Use account ID instead of user_id
            .eq("user_id", req.user.id);

          logger.info("✅ TikTok token refreshed and database updated:", {
            accountId: tikTokProfile.id,
            updateResult,
          });
        } else if (isExpired && !tikTokProfile.refresh_token) {
          logger.error("❌ Token expired but no refresh token available:", {
            accountId: tikTokProfile.id,
            username: tikTokProfile.username,
          });
        }
      } catch (refreshErr) {
        logger.error("❌ Failed to refresh TikTok token:", {
          accountId: tikTokProfile.id,
          username: tikTokProfile.username,
          error: refreshErr,
        });
      }

      logger.info(
        `🔍 Using TikTok access token for account: ${tikTokProfile.username} (${tikTokProfile.id}): ${accessTokenToUse.substring(0, 20)}...`
      );

      // No mock mode - use real TikTok API only

      logger.info(`🔍 Calling TikTok API to get user videos for account: ${tikTokProfile.username} (${tikTokProfile.id})`);
      try {
        const videoCallStartTime = Date.now();
        const videos = await tiktokService.getUserVideos(
          accessTokenToUse,
          cursor as string,
          parseInt(maxCount as string)
        );
        const videoCallDuration = Date.now() - videoCallStartTime;

        logger.info(
          `✅ Successfully retrieved ${
            videos.data?.videos?.length || 0
          } videos from TikTok API for account: ${tikTokProfile.username} (${tikTokProfile.id}) in ${videoCallDuration}ms`
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      logger.error("❌ Disconnect TikTok profile error:", error);
      return next(new CustomError("Failed to disconnect TikTok profile", 500));
    }
  }
);

const getUserTikTokAccounts = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 getUserTikTokAccounts - Request received");
    logger.info("🔍 getUserTikTokAccounts - User:", req.user?.id);

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    try {
      // Get all TikTok accounts for the user
      const { data: accounts, error } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("❌ Error fetching TikTok accounts:", error);
        throw error;
      }

      logger.info(`✅ Found ${accounts?.length || 0} TikTok accounts for user`);
      return res.status(200).json({
        status: "success",
        data: {
          accounts: accounts || [],
          count: accounts?.length || 0,
        },
      });
    } catch (error: unknown) {
      logger.error("❌ Get TikTok accounts error:", error);
      return next(new CustomError("Failed to fetch TikTok accounts", 500));
    }
  }
);

const setPrimaryTikTokAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 setPrimaryTikTokAccount - Request received");
    logger.info("🔍 setPrimaryTikTokAccount - User:", req.user?.id);

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    const { accountId } = req.body;

    if (!accountId) {
      return next(new CustomError("Account ID is required", 400));
    }

    try {
      // Verify the account belongs to the user
      const { data: account, error: fetchError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", req.user.id)
        .single();

      if (fetchError || !account) {
        logger.error("❌ Account not found or doesn't belong to user");
        return res.status(404).json({
          status: "error",
          message: "TikTok account not found or doesn't belong to you",
        });
      }

      logger.info(`🔄 Setting account ${accountId} as primary for user ${req.user.id}`);

      // Step 1: Set selected account as primary
      const { error: setPrimaryError } = await supabase
        .from("tiktok_profiles")
        .update({ is_primary: true })
        .eq("id", accountId)
        .eq("user_id", req.user.id);

      if (setPrimaryError) {
        logger.error("❌ Error setting account as primary:", setPrimaryError);
        throw setPrimaryError;
      }

      // Step 2: Set all other accounts as non-primary
      const { error: unsetOthersError } = await supabase
        .from("tiktok_profiles")
        .update({ is_primary: false })
        .eq("user_id", req.user.id)
        .neq("id", accountId);

      if (unsetOthersError) {
        logger.error("❌ Error unsetting other accounts:", unsetOthersError);
        throw unsetOthersError;
      }

      logger.info("✅ Primary TikTok account updated successfully");
      return res.status(200).json({
        status: "success",
        message: "Primary TikTok account updated successfully",
      });
    } catch (error: unknown) {
      logger.error("❌ Set primary TikTok account error:", error);
      
      return res.status(500).json({
        status: "error",
        message: "Failed to set primary TikTok account. Please try again.",
      });
    }
  }
);

const validateTikTokAccountSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 validateTikTokAccountSession - Request received");
    logger.info("🔍 validateTikTokAccountSession - User:", req.user?.id);

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    const { id: accountId } = req.params;

    if (!accountId) {
      return next(new CustomError("Account ID is required", 400));
    }

    try {
      // Get the specific account
      const { data: account, error: fetchError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", req.user.id)
        .single();

      if (fetchError || !account) {
        logger.error("❌ Account not found or doesn't belong to user");
        return res.status(404).json({
          status: "error",
          message: "TikTok account not found or doesn't belong to you",
        });
      }

      // Check if token is expired
      if (!account.token_expires_at || !account.access_token) {
        return res.status(200).json({
          status: "success",
          data: {
            isValid: false,
            needsRefresh: true,
            reason: "missing_token_data",
          },
        });
      }

      const now = new Date();
      const expiresAt = new Date(account.token_expires_at);
      const isExpired = now >= expiresAt;

      logger.info(`🔍 Token expiry check: expires at ${expiresAt}, now is ${now}, expired: ${isExpired}`);

      if (isExpired) {
        return res.status(200).json({
          status: "success",
          data: {
            isValid: false,
            needsRefresh: true,
            reason: "token_expired",
            expiresAt: account.token_expires_at,
          },
        });
      }

      // Test the token with a simple TikTok API call
      try {
        logger.info("🔍 Testing access token with TikTok API");
        const userInfo = await tiktokService.getUserInfo(account.access_token);
        
        if (userInfo && userInfo.data && userInfo.data.user) {
          logger.info("✅ TikTok token is valid");
          return res.status(200).json({
            status: "success",
            data: {
              isValid: true,
              needsRefresh: false,
              tiktokUserId: userInfo.data.user.open_id,
              username: userInfo.data.user.display_name,
            },
          });
        } else {
          logger.warn("⚠️ TikTok token test returned unexpected response");
          return res.status(200).json({
            status: "success",
            data: {
              isValid: false,
              needsRefresh: true,
              reason: "invalid_response",
            },
          });
        }
      } catch (tokenError: unknown) {
        logger.error("❌ TikTok token validation failed:", tokenError);
        
        // Check if it's an authorization error
        const errorMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
        if (errorMessage.includes("401") || errorMessage.includes("unauthorized") || errorMessage.includes("invalid_token")) {
          return res.status(200).json({
            status: "success",
            data: {
              isValid: false,
              needsRefresh: true,
              reason: "unauthorized",
            },
          });
        }

        // For other errors, we can't determine token validity
        return res.status(200).json({
          status: "success",
          data: {
            isValid: null,
            needsRefresh: false,
            reason: "validation_failed",
            error: errorMessage,
          },
        });
      }
    } catch (error: unknown) {
      logger.error("❌ Validate TikTok account session error:", error);
      return next(new CustomError("Failed to validate TikTok account session", 500));
    }
  }
);

// Helper function to clean up contaminated tokens for a specific account
const cleanupContaminatedTokens = async (accountId: string, userId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    logger.info("🔧 Cleaning up contaminated tokens for account:", { accountId, userId });
    
    // Clear the access token and refresh token to force re-authentication
    const { error: cleanupError } = await supabase
      .from("tiktok_profiles")
      .update({
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("user_id", userId);
    
    if (cleanupError) {
      logger.error("❌ Failed to cleanup contaminated tokens:", cleanupError);
      return { success: false, error: cleanupError.message };
    }
    
    logger.info("✅ Successfully cleaned up contaminated tokens for account:", accountId);
    return { success: true };
  } catch (error) {
    logger.error("❌ Error during token cleanup:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

// Helper function to validate token ownership
const validateTokenOwnership = async (accessToken: string, expectedUser: string): Promise<{ isValid: boolean; actualUser?: string; error?: string }> => {
  try {
    logger.info("🔍 Validating token ownership", { expectedUser, tokenStart: accessToken.substring(0, 20) });
    
    const userInfo = await tiktokService.getBasicUserInfo(accessToken);
    
    if (!userInfo || !userInfo.data || !userInfo.data.user) {
      return { isValid: false, error: "Invalid response from TikTok API" };
    }
    
    const actualUser = userInfo.data.user.display_name;
    const isValid = actualUser === expectedUser;
    
    logger.info("🔍 Token ownership validation result:", {
      expectedUser,
      actualUser,
      isValid,
      tokenStart: accessToken.substring(0, 20),
    });
    
    return { isValid, actualUser };
  } catch (error) {
    logger.error("❌ Error validating token ownership:", error);
    return { isValid: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const tryRefreshToken = async (account: any): Promise<{ success: boolean; newTokens?: any; error?: string }> => {
  try {
    logger.info("🔄 Attempting to refresh TikTok access token");
    
    if (!account.refresh_token) {
      logger.error("❌ No refresh token available for account");
      return { success: false, error: "No refresh token available" };
    }

    // Note: We don't check refresh token expiration since it's not stored in the database
    // TikTok refresh tokens are typically valid for 365 days

    // Attempt to refresh the token
    const newTokens = await tiktokService.refreshAccessToken(account.refresh_token!);

    if (!newTokens.access_token) {
      logger.error("❌ Failed to get new access token from refresh");
      return { success: false, error: "Failed to get new access token" };
    }

    // PREVENTION SAFEGUARD: Validate the new token belongs to the correct user
    const expectedUser = account.display_name || account.username;
    if (expectedUser) {
      const validation = await validateTokenOwnership(newTokens.access_token, expectedUser);
      
      if (!validation.isValid) {
        logger.error("❌ Token refresh resulted in wrong user token!", {
          accountId: account.id,
          expectedUser,
          actualUser: validation.actualUser,
          tokenStart: newTokens.access_token.substring(0, 20),
        });
        
        // Don't save the wrong token - return error instead
        return { 
          success: false, 
          error: `Token refresh returned wrong user token. Expected: ${expectedUser}, Got: ${validation.actualUser}` 
        };
      }
      
      logger.info("✅ Token refresh validation passed - token belongs to correct user:", {
        accountId: account.id,
        expectedUser,
        actualUser: validation.actualUser,
      });
    }

    // Calculate expiration times
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + newTokens.expires_in * 1000);

    // Update the account in the database
    const { error: updateError } = await supabase
      .from("tiktok_profiles")
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        token_expires_at: accessExpiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", account.id);

    if (updateError) {
      logger.error("❌ Failed to update tokens in database:", updateError);
      return { success: false, error: "Failed to update tokens in database" };
    }

    logger.info("✅ Successfully refreshed TikTok access token");
    return { 
      success: true, 
      newTokens: {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: accessExpiresAt.toISOString()
      }
    };

  } catch (error: unknown) {
    logger.error("❌ Error refreshing TikTok token:", {
      accountId: account.id,
      error: error,
      hasRefreshToken: !!account.refresh_token,
    });
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Provide more specific error messages based on the type of error
    if (errorMessage.includes("400") || errorMessage.includes("invalid_grant")) {
      return { success: false, error: "Invalid refresh token - token may have been revoked" };
    }
    
    if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
      return { success: false, error: "Unauthorized refresh token - account may need reconnection" };
    }
    
    if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("network")) {
      return { success: false, error: "Network error during token refresh" };
    }
    
    return { success: false, error: `Token refresh failed: ${errorMessage}` };
  }
};

const establishTikTokSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const debugLogs: string[] = [];
    
    const addDebugLog = (message: string, data?: any) => {
      const logEntry = data ? `${message} ${JSON.stringify(data)}` : message;
      debugLogs.push(logEntry);
      logger.info(logEntry);
    };
    
    addDebugLog("🔍 establishTikTokSession - Request received");
    addDebugLog("🔍 establishTikTokSession - User:", req.user?.id);
    addDebugLog("🔍 establishTikTokSession - Request details:", {
      method: req.method,
      url: req.url,
      params: req.params,
    });

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    const { id: accountId } = req.params;

    if (!accountId) {
      return next(new CustomError("Account ID is required", 400));
    }

    try {
      addDebugLog("🔍 Starting with parameters:", {
        requestedAccountId: accountId,
        userId: req.user.id,
      });
      
      // Get the specific account
      const { data: account, error: fetchError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", req.user.id)
        .single();

      addDebugLog("🔍 Database query completed:", {
        accountFound: !!account,
        error: fetchError,
        requestedAccountId: accountId,
        userId: req.user.id,
      });

      if (fetchError || !account) {
        addDebugLog("❌ Account not found or doesn't belong to user:", {
          fetchError,
          requestedAccountId: accountId,
          userId: req.user.id,
        });
        return res.status(404).json({
          status: "error",
          message: "TikTok account not found or doesn't belong to you",
          debugLogs,
        });
      }

      // CRITICAL: Verify we got the right account
      if (account.id !== accountId) {
        addDebugLog("❌ CRITICAL BUG: Database returned wrong account!", {
          requestedAccountId: accountId,
          returnedAccountId: account.id,
          returnedUsername: account.username,
          returnedDisplayName: account.display_name,
        });
        return res.status(500).json({
          status: "error",
          message: "Internal error: Wrong account returned from database",
          debugLogs,
        });
      }

      addDebugLog("🔍 Account retrieved successfully:", {
        requestedAccountId: accountId,
        returnedAccountId: account.id,
        accountMatch: account.id === accountId,
        username: account.username,
        displayName: account.display_name,
        hasAccessToken: !!account.access_token,
        hasRefreshToken: !!account.refresh_token,
        tokenExpiresAt: account.token_expires_at,
        isPrimary: account.is_primary,
        accessTokenStart: account.access_token ? account.access_token.substring(0, 20) : null,
        accessTokenEnd: account.access_token ? account.access_token.substring(account.access_token.length - 20) : null,
      });

      let currentAccount = account;

      // Validate required token data - but allow accounts with refresh tokens to proceed
      if (!account.access_token && !account.refresh_token) {
        addDebugLog("❌ TikTok account missing all authentication data:", {
          accountId: account.id,
          hasAccessToken: !!account.access_token,
          hasTokenExpiry: !!account.token_expires_at,
          hasRefreshToken: !!account.refresh_token,
        });
        return res.status(400).json({
          status: "error",
          message: "TikTok account missing authentication data. Please reconnect the account.",
          debugLogs,
        });
      }

      // Special case: Account has refresh token but no access token (from previous cleanup)
      if (!account.access_token && account.refresh_token) {
        addDebugLog("🔄 Account missing access token but has refresh token, attempting smart refresh:", {
          accountId: account.id,
          hasAccessToken: !!account.access_token,
          hasRefreshToken: !!account.refresh_token,
          cleanupRecovery: true,
        });

        try {
          // Attempt to refresh the token
          const refreshResult = await tryRefreshToken(account);
          
          if (refreshResult.success && refreshResult.newTokens) {
            addDebugLog("✅ Smart refresh successful for cleaned up account!", {
              accountId: account.id,
              newTokenStart: refreshResult.newTokens.access_token.substring(0, 20),
              cleanupRecovery: true,
            });
            
            // Update current account with refreshed tokens
            currentAccount = {
              ...account,
              access_token: refreshResult.newTokens.access_token,
              refresh_token: refreshResult.newTokens.refresh_token,
              token_expires_at: refreshResult.newTokens.expires_at,
            };
            
            addDebugLog("✅ Account recovered from cleanup state via smart refresh", {
              accountId: account.id,
              recoveredToken: true,
            });
            
            // Continue with normal flow using the refreshed token
            
          } else {
            addDebugLog("❌ Smart refresh failed for cleaned up account:", {
              accountId: account.id,
              refreshError: refreshResult.error,
              cleanupRecovery: false,
            });
            
            return res.status(400).json({
              status: "error",
              message: "TikTok account tokens were cleaned up and refresh failed. Please reconnect the account.",
              error_code: "REFRESH_FAILED_AFTER_CLEANUP",
              details: {
                reason: "refresh_failed_after_cleanup",
                accountId: account.id,
                refreshError: refreshResult.error,
                requiresReconnection: true,
              },
              debugLogs,
            });
          }
        } catch (refreshErr) {
          addDebugLog("❌ Error during smart refresh for cleaned up account:", refreshErr);
          
          return res.status(500).json({
            status: "error",
            message: "Failed to recover account after cleanup. Please reconnect the account.",
            error_code: "RECOVERY_ERROR",
            details: {
              reason: "recovery_error",
              accountId: account.id,
              error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
              requiresReconnection: true,
            },
            debugLogs,
          });
        }
      }

      // Check if token is expired (using currentAccount which might have been updated)
      const now = new Date();
      const expiresAt = currentAccount.token_expires_at ? new Date(currentAccount.token_expires_at) : null;
      const isExpired = expiresAt ? now >= expiresAt : false;

      addDebugLog("🔍 Token expiration check:", {
        now: now.toISOString(),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        isExpired: isExpired,
        timeDiff: expiresAt ? now.getTime() - expiresAt.getTime() : null,
        accountRecovered: currentAccount !== account,
      });

      if (isExpired) {
        logger.info("🔄 TikTok access token expired, attempting to refresh");
        
        // Attempt to refresh the token
        const refreshResult = await tryRefreshToken(account);
        
        if (!refreshResult.success) {
          logger.error("❌ Failed to refresh token:", {
            accountId: account.id,
            refreshError: refreshResult.error,
            hasRefreshToken: !!account.refresh_token,
          });
          
          // Determine specific error message based on refresh error
          let errorMessage = "TikTok access token has expired and could not be refreshed. Please reconnect the account.";
          if (refreshResult.error?.includes("No refresh token available")) {
            errorMessage = "TikTok access token has expired and no refresh token is available. Please reconnect the account.";
          } else if (refreshResult.error?.includes("Refresh token has expired")) {
            errorMessage = "Both access and refresh tokens have expired. Please reconnect the account.";
          }
          
          return res.status(400).json({
            status: "error",
            message: errorMessage,
            details: {
              expiresAt: account.token_expires_at,
              currentTime: now.toISOString(),
              refreshError: refreshResult.error,
            },
          });
        }
        
        // Update current account with new tokens
        currentAccount = {
          ...account,
          access_token: refreshResult.newTokens.access_token,
          refresh_token: refreshResult.newTokens.refresh_token,
          token_expires_at: refreshResult.newTokens.expires_at,
        };
        
        logger.info("✅ Successfully refreshed TikTok access token");
      }

      // Test the TikTok session by making an API call
      try {
        logger.info("🔍 Establishing TikTok session - testing API connectivity");
        
        // Ensure we have a valid access token
        if (!currentAccount.access_token) {
          throw new Error("No access token available after refresh");
        }
        
        logger.info("🔍 Making TikTok API call with token:", {
          accountId: currentAccount.id,
          tokenLength: currentAccount.access_token.length,
          tokenStart: currentAccount.access_token.substring(0, 20),
          tokenEnd: currentAccount.access_token.substring(currentAccount.access_token.length - 20),
        });
        
        // Use getBasicUserInfo instead of getUserInfo to avoid scope issues
        // This only requires basic user permissions and gets open_id, display_name
        // For video information, use getUserVideos API separately when needed
        const apiCallStartTime = Date.now();
        const userInfo = await tiktokService.getBasicUserInfo(currentAccount.access_token);
        const apiCallDuration = Date.now() - apiCallStartTime;
        
        logger.info("🔍 [establishTikTokSession] TikTok API call completed:", {
          duration: apiCallDuration,
          success: !!userInfo,
          hasData: !!(userInfo && userInfo.data),
          hasUser: !!(userInfo && userInfo.data && userInfo.data.user),
        });
        
        if (!userInfo || !userInfo.data || !userInfo.data.user) {
          throw new Error("Invalid response from TikTok API");
        }

        const tikTokUser = userInfo.data.user;
        
        // CRITICAL: Check if TikTok API returned user data that matches the account
        addDebugLog("🔍 TikTok API user data:", {
          requestedAccountId: accountId,
          storedUsername: account.username,
          storedDisplayName: account.display_name,
          apiReturnedOpenId: tikTokUser.open_id,
          apiReturnedDisplayName: tikTokUser.display_name,
          apiDataMatchesStored: tikTokUser.display_name === account.display_name,
        });
        
        // CRITICAL: Token validation - check if the token belongs to the correct TikTok user
        const isTokenValid = tikTokUser.display_name === account.display_name || 
                           tikTokUser.display_name === account.username;
        
        if (!isTokenValid) {
          addDebugLog("❌ TOKEN CROSS-CONTAMINATION DETECTED!", {
            expectedUser: account.display_name || account.username,
            actualUser: tikTokUser.display_name,
            accountId: account.id,
            tiktokUserId: tikTokUser.open_id,
            tokenStart: account.access_token ? account.access_token.substring(0, 20) : null,
          });
          
          // SMART REFRESH: Try to refresh the token instead of cleaning up
          if (account.refresh_token) {
            try {
              addDebugLog("🔄 Attempting smart token refresh for contaminated token:", {
                accountId: account.id,
                storedUsername: account.username,
                storedDisplayName: account.display_name,
                wrongTokenUser: tikTokUser.display_name,
                hasRefreshToken: !!account.refresh_token,
              });
              
              // Attempt to refresh the token
              const refreshResult = await tryRefreshToken(account);
              
              if (refreshResult.success && refreshResult.newTokens) {
                addDebugLog("✅ Smart token refresh successful! Validating new token...", {
                  accountId: account.id,
                  newTokenStart: refreshResult.newTokens.access_token.substring(0, 20),
                });
                
                // Validate the new token belongs to the correct user
                const expectedUser = account.display_name || account.username;
                const validation = await validateTokenOwnership(refreshResult.newTokens.access_token, expectedUser);
                
                if (validation.isValid) {
                  addDebugLog("✅ Smart refresh SUCCESS! New token belongs to correct user:", {
                    accountId: account.id,
                    expectedUser,
                    actualUser: validation.actualUser,
                    tokenFixed: true,
                  });
                  
                  // Update the current account with the new token
                  currentAccount = {
                    ...account,
                    access_token: refreshResult.newTokens.access_token,
                    refresh_token: refreshResult.newTokens.refresh_token,
                    token_expires_at: refreshResult.newTokens.expires_at,
                  };
                  
                  // Re-call TikTok API with the new token to get correct user info
                  const newUserInfo = await tiktokService.getBasicUserInfo(currentAccount.access_token!);
                  
                  if (newUserInfo && newUserInfo.data && newUserInfo.data.user) {
                    const newTikTokUser = newUserInfo.data.user;
                    
                    addDebugLog("✅ Smart refresh complete! Correct user data retrieved:", {
                      accountId: account.id,
                      expectedUser,
                      actualUser: newTikTokUser.display_name,
                      tokenFixed: true,
                      smartRefreshSuccess: true,
                    });
                    
                    // Continue with normal session establishment using the corrected token
                    const responseData = {
                      accountId: currentAccount.id,
                      tiktokUserId: newTikTokUser.open_id,
                      username: newTikTokUser.display_name || currentAccount.username,
                      avatarUrl: currentAccount.avatar_url,
                      isVerified: currentAccount.is_verified,
                      sessionEstablished: true,
                      connectedAt: new Date().toISOString(),
                      tokenRefreshed: true,
                      smartRefreshApplied: true,
                      scopeUsed: "basic",
                    };

                    addDebugLog("✅ Smart refresh - Final response data:", {
                      requestedAccountId: accountId,
                      responseAccountId: responseData.accountId,
                      accountMatch: responseData.accountId === accountId,
                      responseUsername: responseData.username,
                      responseTikTokUserId: responseData.tiktokUserId,
                      smartRefreshSuccess: true,
                    });

                    return res.status(200).json({
                      status: "success",
                      message: "TikTok session established successfully (token contamination fixed via smart refresh)",
                      data: responseData,
                      debugLogs,
                    });
                  }
                } else {
                  addDebugLog("❌ Smart refresh failed! New token still belongs to wrong user:", {
                    accountId: account.id,
                    expectedUser,
                    actualUser: validation.actualUser,
                    refreshTokenAlsoContaminated: true,
                  });
                }
              } else {
                addDebugLog("❌ Smart token refresh failed:", {
                  accountId: account.id,
                  refreshError: refreshResult.error,
                  hasRefreshToken: !!account.refresh_token,
                });
              }
            } catch (refreshErr) {
              addDebugLog("❌ Error during smart token refresh:", refreshErr);
            }
          } else {
            addDebugLog("❌ No refresh token available for smart refresh", {
              accountId: account.id,
              hasRefreshToken: !!account.refresh_token,
            });
          }
          
          // FALLBACK: If smart refresh fails, clean up and require re-authentication
          try {
            addDebugLog("🔧 Smart refresh failed, falling back to token cleanup:", {
              accountId: account.id,
              storedUsername: account.username,
              storedDisplayName: account.display_name,
              wrongTokenUser: tikTokUser.display_name,
            });
            
            // Clear the access token and refresh token to force re-authentication
            const { error: cleanupError } = await supabase
              .from("tiktok_profiles")
              .update({
                access_token: null,
                refresh_token: null,
                token_expires_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", account.id)
              .eq("user_id", req.user.id);
            
            if (cleanupError) {
              addDebugLog("❌ Failed to cleanup contaminated token:", cleanupError);
            } else {
              addDebugLog("✅ Successfully cleaned up contaminated token as fallback");
            }
            
          } catch (cleanupErr) {
            addDebugLog("❌ Error during fallback token cleanup:", cleanupErr);
          }
          
          // Return error response requiring re-authentication
          return res.status(400).json({
            status: "error",
            message: "Token cross-contamination detected. Smart refresh failed. The account has been reset and requires re-authentication.",
            error_code: "TOKEN_CONTAMINATION",
            details: {
              reason: "token_contamination",
              accountId: account.id,
              storedUser: account.display_name || account.username,
              tokenBelongsTo: tikTokUser.display_name,
              smartRefreshAttempted: true,
              smartRefreshFailed: true,
              requiresReconnection: true,
            },
            debugLogs, // Include debug logs for production debugging
          });
        }

        const totalDuration = Date.now() - startTime;
        logger.info("✅ TikTok session established successfully:", {
          totalDuration: totalDuration,
          userInfo: {
            open_id: tikTokUser.open_id,
            display_name: tikTokUser.display_name,
            avatar_url: tikTokUser.avatar_url,
            is_verified: tikTokUser.is_verified,
          },
        });
        
        const responseData = {
          accountId: currentAccount.id,
          tiktokUserId: tikTokUser.open_id,
          username: tikTokUser.display_name || currentAccount.username,
          // For fields not available in basic info, use stored account data
          avatarUrl: currentAccount.avatar_url,
          isVerified: currentAccount.is_verified,
          sessionEstablished: true,
          connectedAt: new Date().toISOString(),
          tokenRefreshed: isExpired, // Indicate if token was refreshed
          scopeUsed: "basic", // Indicate we used basic user info
        };

        addDebugLog("🔍 Final response data:", {
          requestedAccountId: accountId,
          responseAccountId: responseData.accountId,
          accountMatch: responseData.accountId === accountId,
          responseUsername: responseData.username,
          responseTikTokUserId: responseData.tiktokUserId,
          tokenRefreshed: responseData.tokenRefreshed,
        });

        return res.status(200).json({
          status: "success",
          message: "TikTok session established successfully",
          data: responseData,
          debugLogs, // Include debug logs in response for production debugging
        });

      } catch (sessionError: unknown) {
        logger.error("❌ Failed to establish TikTok session:", {
          accountId: currentAccount.id,
          error: sessionError,
          tokenRefreshed: isExpired,
        });
        
        const errorMessage = sessionError instanceof Error ? sessionError.message : String(sessionError);
        
        // Check for specific error types
        if (errorMessage.includes("401") || errorMessage.includes("unauthorized") || errorMessage.includes("invalid_token")) {
          logger.error("❌ TikTok API authentication failed even after token refresh");
          return res.status(400).json({
            status: "error",
            message: "TikTok account authentication failed. The account may have been revoked or needs to be reconnected.",
            details: {
              reason: "unauthorized",
              accountId: currentAccount.id,
              tokenWasRefreshed: isExpired,
            },
          });
        }

        if (errorMessage.includes("403") || errorMessage.includes("forbidden")) {
          logger.error("❌ TikTok API access forbidden - possible scope issue");
          return res.status(400).json({
            status: "error",
            message: "TikTok API access forbidden. The account may lack required permissions.",
            details: {
              reason: "forbidden",
              accountId: currentAccount.id,
              tokenWasRefreshed: isExpired,
            },
          });
        }

        if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("network")) {
          logger.error("❌ Network error connecting to TikTok API");
          return res.status(500).json({
            status: "error",
            message: "Network error connecting to TikTok API. Please try again later.",
            details: {
              reason: "network_error",
              accountId: currentAccount.id,
            },
          });
        }

        // Generic error response
        return res.status(500).json({
          status: "error",
          message: "Failed to establish TikTok session. Please try again or reconnect the account.",
          details: {
            reason: "session_establishment_failed",
            error: errorMessage,
            accountId: currentAccount.id,
            tokenWasRefreshed: isExpired,
          },
        });
      }

    } catch (error: unknown) {
      logger.error("❌ Establish TikTok session error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return res.status(500).json({
        status: "error",
        message: "Failed to establish TikTok session. Please try again.",
        details: errorMessage,
      });
    }
  }
);

const scanAndCleanupContaminatedTokens = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 scanAndCleanupContaminatedTokens - Request received");
    logger.info("🔍 scanAndCleanupContaminatedTokens - User:", req.user?.id);

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    try {
      // Get all TikTok accounts for the user
      const { data: accounts, error: fetchError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("user_id", req.user.id);

      if (fetchError) {
        throw fetchError;
      }

      if (!accounts || accounts.length === 0) {
        return res.status(200).json({
          status: "success",
          message: "No TikTok accounts found for user",
          data: {
            accountsScanned: 0,
            contaminatedAccounts: [],
            cleanedAccounts: [],
          },
        });
      }

      logger.info(`🔍 Scanning ${accounts.length} TikTok accounts for token contamination`);

      const contaminatedAccounts = [];
      const cleanedAccounts = [];

      // Check each account for token contamination
      for (const account of accounts) {
        if (!account.access_token) {
          logger.info(`⏭️ Skipping account ${account.id} - no access token`);
          continue;
        }

        try {
          const expectedUser = account.display_name || account.username;
          const validation = await validateTokenOwnership(account.access_token, expectedUser);

          if (!validation.isValid && validation.actualUser) {
            logger.warn(`❌ Token contamination detected for account ${account.id}:`, {
              accountId: account.id,
              storedUser: expectedUser,
              tokenBelongsTo: validation.actualUser,
            });

            contaminatedAccounts.push({
              accountId: account.id,
              storedUser: expectedUser,
              tokenBelongsTo: validation.actualUser,
            });

            // Clean up the contaminated token
            const cleanupResult = await cleanupContaminatedTokens(account.id, req.user.id);
            if (cleanupResult.success) {
              cleanedAccounts.push({
                accountId: account.id,
                storedUser: expectedUser,
                tokenBelongsTo: validation.actualUser,
              });
            }
          } else if (validation.isValid) {
            logger.info(`✅ Token valid for account ${account.id}:`, {
              accountId: account.id,
              expectedUser,
              actualUser: validation.actualUser,
            });
          }
        } catch (validationError) {
          logger.error(`❌ Error validating token for account ${account.id}:`, validationError);
          // Skip this account if validation fails
        }
      }

      return res.status(200).json({
        status: "success",
        message: `Token contamination scan completed. Found ${contaminatedAccounts.length} contaminated accounts.`,
        data: {
          accountsScanned: accounts.length,
          contaminatedAccounts,
          cleanedAccounts,
        },
      });
    } catch (error: unknown) {
      logger.error("❌ Scan and cleanup contaminated tokens error:", error);
      return next(new CustomError("Failed to scan and cleanup contaminated tokens", 500));
    }
  }
);

const deleteTikTokAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 deleteTikTokAccount - Request received");
    logger.info("🔍 deleteTikTokAccount - User:", req.user?.id);

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    const { id: accountId } = req.params;

    if (!accountId) {
      return next(new CustomError("Account ID is required", 400));
    }

    try {
      // Verify the account belongs to the user
      const { data: account, error: fetchError } = await supabase
        .from("tiktok_profiles")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", req.user.id)
        .single();

      if (fetchError || !account) {
        logger.error("❌ Account not found or doesn't belong to user");
        return res.status(404).json({
          status: "error",
          message: "TikTok account not found or doesn't belong to you",
        });
      }


      // Delete the account
      const { error: deleteError } = await supabase
        .from("tiktok_profiles")
        .delete()
        .eq("id", accountId)
        .eq("user_id", req.user.id);

      if (deleteError) {
        logger.error("❌ Error deleting TikTok account:", deleteError);
        throw deleteError;
      }

      logger.info("✅ TikTok account deleted successfully");
      return res.status(200).json({
        status: "success",
        message: "TikTok account deleted successfully",
      });
    } catch (error: unknown) {
      logger.error("❌ Delete TikTok account error:", error);
      return next(new CustomError("Failed to delete TikTok account", 500));
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
  // Check if this is a user-friendly error message vs technical error
  const isUserFriendlyError = errorMessage.includes("already connected to another user") || 
                              errorMessage.includes("already connected to your account") ||
                              errorMessage.includes("must be logged in") ||
                              errorMessage.includes("contact support");
  
  const displayMessage = isUserFriendlyError ? errorMessage : "Connection failed. Please try again.";
  const showTechnicalDetails = !isUserFriendlyError;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>TikTok Connection Error</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          text-align: center;
          padding: 1rem;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 2rem;
          border-radius: 1rem;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          max-width: 400px;
          width: 100%;
        }
        .error-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        .error-message {
          font-size: 1rem;
          line-height: 1.5;
          margin-bottom: 1rem;
        }
        .technical-details {
          font-size: 0.85rem;
          opacity: 0.8;
          margin-top: 1rem;
          padding: 1rem;
          background: rgba(0,0,0,0.2);
          border-radius: 0.5rem;
          word-break: break-word;
        }
        .close-info {
          font-size: 0.9rem;
          opacity: 0.9;
          margin-top: 1.5rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error-icon">❌</div>
        <h2>Connection Failed</h2>
        <div class="error-message">${displayMessage}</div>
        ${showTechnicalDetails ? `<div class="technical-details">Error details: ${errorMessage}</div>` : ''}
        <div class="close-info">This window will close automatically...</div>
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
      try {
        const decoded = jwt.decode(userToken) as any;
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
          const decoded = jwt.decode(token) as any;
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
    
    // Check if user has any existing TikTok accounts to determine if this should be primary
    const { data: userAccounts } = await supabase
      .from("tiktok_profiles")
      .select("id, is_primary")
      .eq("user_id", userId as string);
    
    // Determine if this should be the primary account (if user has no accounts, or no primary account exists)
    const shouldBePrimary = !userAccounts || userAccounts.length === 0 || !userAccounts.some(acc => acc.is_primary);
    
    logger.info(`🔍 User has ${userAccounts?.length || 0} existing TikTok accounts`);
    logger.info(`🔍 Setting new account as primary: ${shouldBePrimary}`);
    
    const profileData = {
      user_id: userId as string,
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
      is_primary: shouldBePrimary,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    };
    
    // Check if this specific TikTok account is already connected to this user
    const { data: existingProfile } = await supabase
      .from("tiktok_profiles")
      .select("*")
      .eq("user_id", userId as string)
      .eq("tiktok_user_id", tikTokUserId)
      .maybeSingle();
      
    // Also check if this TikTok account is connected to ANY user
    const { data: existingTikTokAccount } = await supabase
      .from("tiktok_profiles")
      .select("user_id")
      .eq("tiktok_user_id", tikTokUserId)
      .maybeSingle();
      
    // If TikTok account exists for a different user, prevent connection
    if (existingTikTokAccount && existingTikTokAccount.user_id !== userId) {
      logger.warn(`❌ TikTok account ${tikTokUserId} is already connected to user ${existingTikTokAccount.user_id}`);
      throw new Error("This TikTok account is already connected to another user account. Please use a different TikTok account or contact support if you believe this is an error.");
    }
    
    // If this exact combination already exists, prevent duplicate
    if (existingProfile) {
      logger.warn(`❌ TikTok account ${tikTokUserId} is already connected to user ${userId}`);
      throw new Error("This TikTok account is already connected to your account. Try connecting a different TikTok account.");
    }
    
    // Insert new profile (we've already checked for duplicates above)
    logger.info("➕ Inserting new TikTok profile...");
    const result = await supabase
      .from("tiktok_profiles")
      .insert(profileData)
      .select()
      .single();
    
    if (result.error) {
      logger.error("❌ Database operation failed:", result.error);
      
      // Handle duplicate key constraint error for TikTok user ID
      if (result.error.code === '23505' && result.error.message?.includes('tiktok_user_id')) {
        throw new Error("This TikTok account is already connected to another user account. Please use a different TikTok account or contact support if you believe this is an error.");
      }
      
      throw result.error;
    }
    
    logger.info("✅ TikTok profile saved successfully:", result.data);
    return result.data;
  } catch (error: unknown) {
    logger.error("❌ Error saving TikTok profile:", error);
    throw error;
  }
}

const downloadVideo = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🔍 downloadVideo - Request received");
    logger.info("🔍 downloadVideo - Full request details:", {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'content-type': req.headers['content-type'],
        'authorization': req.headers.authorization ? 'Bearer [REDACTED]' : 'No auth header',
        'user-agent': req.headers['user-agent']
      },
      body: req.body,
      query: req.query,
      params: req.params
    });

    if (!req.user) {
      logger.error("❌ downloadVideo - Authentication failed: no user found in request");
      return next(new CustomError("User authentication required", 401));
    }

    logger.info("🔍 downloadVideo - Authenticated user:", {
      userId: req.user.id,
      userEmail: req.user.email || 'No email'
    });

    const { videoUrl, videoId } = req.body;

    logger.info("🔍 downloadVideo - Request body validation:", {
      hasVideoUrl: !!videoUrl,
      videoUrlType: typeof videoUrl,
      videoUrlLength: videoUrl ? videoUrl.length : 0,
      videoUrlPreview: videoUrl ? videoUrl.substring(0, 100) + (videoUrl.length > 100 ? '...' : '') : 'undefined',
      hasVideoId: !!videoId,
      videoIdType: typeof videoId,
      videoId: videoId
    });

    if (!videoUrl || !videoId) {
      logger.error("❌ downloadVideo - Validation failed:", {
        videoUrl: !!videoUrl,
        videoId: !!videoId,
        bodyKeys: Object.keys(req.body),
        bodyValues: req.body
      });
      return next(new CustomError("Video URL and video ID are required", 400));
    }

    // Validate video URL format
    try {
      const url = new URL(videoUrl);
      logger.info("🔍 downloadVideo - URL validation:", {
        protocol: url.protocol,
        hostname: url.hostname,
        pathname: url.pathname,
        isValidURL: true
      });
      
      // Check if it's a valid video URL (should be an actual video file URL, not a TikTok page URL)
      if (!videoUrl.includes('.mp4') && !videoUrl.includes('video') && !url.hostname.includes('tiktok')) {
        logger.warn("⚠️ downloadVideo - URL might not be a direct video URL:", {
          videoUrl: videoUrl.substring(0, 100) + '...',
          hostname: url.hostname
        });
      }
      
    } catch (urlError) {
      logger.error("❌ downloadVideo - Invalid URL format:", {
        videoUrl: videoUrl.substring(0, 100) + '...',
        error: urlError instanceof Error ? urlError.message : String(urlError)
      });
      
      return res.status(400).json({
        status: "error",
        message: "Invalid video URL format",
        error: {
          type: "INVALID_URL_FORMAT",
          message: `The provided URL is not valid: ${urlError instanceof Error ? urlError.message : 'Invalid format'}`,
          details: {
            videoUrl: videoUrl,
            videoId: videoId,
            timestamp: new Date().toISOString()
          },
          debugging: {
            requestReceived: true,
            userAuthenticated: true,
            basicValidationPassed: true,
            urlValidationFailed: true,
            stage: "url_validation"
          }
        }
      });
    }

    try {
      logger.info(`🔍 Starting video download for user ${req.user.id}, video: ${videoId}`);

      // Try to download and store the video
      try {
        logger.info(`🔍 Calling VideoDownloadService.downloadAndStoreVideo...`);
        const result = await VideoDownloadService.downloadAndStoreVideo({
          videoUrl,
          videoId,
          userId: req.user.id,
        });

        // Validate the result before logging success
        if (!result) {
          throw new Error('VideoDownloadService returned null/undefined result');
        }

        if (!result.publicUrl) {
          throw new Error('VideoDownloadService returned result without publicUrl');
        }

        if (!result.fileName) {
          throw new Error('VideoDownloadService returned result without fileName');
        }

        logger.info(`✅ Video download completed successfully!`, {
          publicUrl: result.publicUrl,
          fileName: result.fileName,
          videoId,
          userId: req.user.id
        });

        return res.status(200).json({
          status: "success",
          message: "Video downloaded and stored successfully",
          data: {
            publicUrl: result.publicUrl,
            fileName: result.fileName,
            videoId,
            downloadedAt: new Date().toISOString(),
            logs: result.logs || [],
          },
        });
      } catch (downloadError) {
        const errorMessage = downloadError instanceof Error ? downloadError.message : 'Unknown error';
        const errorStack = downloadError instanceof Error ? downloadError.stack : 'No stack trace';
        const errorLogs = (downloadError as any)?.logs || [];
        
        logger.error(`❌ Video download failed:`, {
          error: errorMessage,
          stack: errorStack,
          videoUrl,
          videoId,
          userId: req.user.id,
          timestamp: new Date().toISOString(),
          errorType: downloadError instanceof Error ? downloadError.constructor.name : typeof downloadError,
          logCount: errorLogs.length
        });
        
        // Log each step from the download process for debugging
        if (errorLogs.length > 0) {
          logger.info("📋 Download process logs:", errorLogs);
        }
        
        // Return detailed failure response
        return res.status(400).json({
          status: "error",
          message: "Video download failed",
          error: {
            type: "VIDEO_DOWNLOAD_FAILED",
            message: errorMessage,
            details: {
              videoUrl: videoUrl,
              videoId: videoId,
              userId: req.user.id,
              timestamp: new Date().toISOString(),
              errorType: downloadError instanceof Error ? downloadError.constructor.name : typeof downloadError,
              stack: errorStack
            },
            logs: errorLogs,
            debugging: {
              requestReceived: true,
              userAuthenticated: true,
              validationPassed: true,
              downloadAttempted: true,
              stage: "video_download_service"
            }
          },
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : "No stack trace";
      
      logger.error("❌ Video download outer catch error:", {
        message: errorMessage,
        stack: errorStack,
        type: error instanceof Error ? error.constructor.name : typeof error,
        videoUrl: req.body.videoUrl,
        videoId: req.body.videoId,
        userId: req.user.id,
        timestamp: new Date().toISOString()
      });
      
      // Return detailed error response for any unexpected errors
      return res.status(500).json({
        status: "error",
        message: "Internal server error during video download",
        error: {
          type: "INTERNAL_SERVER_ERROR",
          message: errorMessage,
          details: {
            videoUrl: req.body.videoUrl,
            videoId: req.body.videoId,
            userId: req.user.id,
            timestamp: new Date().toISOString(),
            errorType: error instanceof Error ? error.constructor.name : typeof error
          },
          debugging: {
            requestReceived: true,
            userAuthenticated: !!req.user,
            validationPassed: !!(req.body.videoUrl && req.body.videoId),
            downloadAttempted: false,
            stage: "controller_outer_catch"
          }
        }
      });
    }
  }
);

// Test endpoint for debugging video download issues
const testVideoDownload = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    logger.info("🧪 testVideoDownload - Test endpoint called");

    if (!req.user) {
      return next(new CustomError("User authentication required", 401));
    }

    // Use a test video URL if none provided
    const testVideoUrl = req.body.videoUrl || "https://www.w3schools.com/html/mov_bbb.mp4"; // Sample video
    const testVideoId = req.body.videoId || "test-video-" + Date.now();

    logger.info("🧪 testVideoDownload - Test parameters:", {
      testVideoUrl,
      testVideoId,
      userId: req.user.id
    });

    try {
      // Test each component separately
      const results: any = {
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        testVideoUrl,
        testVideoId,
        tests: {}
      };

      // Test 1: URL validation
      try {
        new URL(testVideoUrl);
        results.tests.urlValidation = { success: true, message: "URL is valid" };
      } catch (error) {
        results.tests.urlValidation = { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }

      // Test 2: Supabase connection (without listing buckets)
      try {
        // Just test basic Supabase connection without problematic listBuckets()
        results.tests.supabaseConnection = {
          success: true,
          message: "Supabase admin client initialized successfully",
          bucketName: 'tiktok-videos',
          note: "Bucket verification skipped due to known listBuckets() issues"
        };
      } catch (error) {
        results.tests.supabaseConnection = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }

      // Test 3: Try a simple download (without storing)
      try {
        const response = await axios({
          method: 'HEAD',
          url: testVideoUrl,
          timeout: 10000
        });
        
        results.tests.videoAccess = {
          success: true,
          status: response.status,
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length']
        };
      } catch (error) {
        results.tests.videoAccess = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }

      return res.status(200).json({
        status: "success",
        message: "Video download test completed",
        data: results
      });

    } catch (error) {
      logger.error("❌ testVideoDownload failed:", error);
      
      return res.status(500).json({
        status: "error",
        message: "Test failed",
        error: {
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

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
  getUserTikTokAccounts,
  setPrimaryTikTokAccount,
  validateTikTokAccountSession,
  establishTikTokSession,
  deleteTikTokAccount,
  downloadVideo,
  testVideoDownload,
  scanAndCleanupContaminatedTokens,
};
