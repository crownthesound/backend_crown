import axios from "axios";
import { config } from "../config/env";
import { logger } from "../utils/logger";

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

interface TikTokUserInfo {
  data: {
    user: {
      open_id: string;
      union_id: string;
      avatar_url: string;
      avatar_url_100: string;
      avatar_url_200: string;
      display_name: string;
      bio_description: string;
      profile_deep_link: string;
      is_verified: boolean;
      follower_count: number;
      following_count: number;
      likes_count: number;
      video_count: number;
    };
  };
}

interface TikTokVideoData {
  data: {
    videos: Array<{
      id: string;
      title: string;
      cover_image_url: string;
      share_url: string;
      video_description: string;
      duration: number;
      height: number;
      width: number;
      create_time: number;
      view_count: number;
      like_count: number;
      comment_count: number;
      share_count: number;
    }>;
    cursor: string;
    has_more: boolean;
  };
}

const TIKTOK_API_BASE = "https://open.tiktokapis.com";

const exchangeCodeForToken = async (
  code: string,
  codeVerifier?: string
): Promise<TikTokTokenResponse> => {
  try {
    // Always use the Heroku URL as the redirect URI
    const redirectUri =
      "https://crown-backend-390b376d933a.herokuapp.com/api/v1/tiktok/auth/callback";

    const requestBody: any = {
      client_key: config.tiktok.clientKey,
      client_secret: config.tiktok.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };

    // Add code_verifier if provided (for PKCE)
    if (codeVerifier) {
      requestBody.code_verifier = codeVerifier;
    }

    logger.info(
      `🔍 TikTok token exchange - Request body: ${JSON.stringify(requestBody)}`
    );

    // Convert to form-encoded data
    const formData = new URLSearchParams();
    Object.keys(requestBody).forEach((key) => {
      formData.append(key, requestBody[key]);
    });

    logger.info(`🔍 TikTok token exchange - Form data: ${formData.toString()}`);
    logger.info(
      `🔍 TikTok token exchange - Using redirect URI: ${redirectUri}`
    );

    const response = await axios.post(
      `${TIKTOK_API_BASE}/v2/oauth/token/`,
      formData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    logger.info(
      `✅ TikTok token exchange - Response: ${JSON.stringify(response.data)}`
    );

    // Log the scope that was actually granted
    if (response.data && response.data.scope) {
      logger.info(
        "🔍 TikTok token exchange - Scopes granted:",
        response.data.scope
      );

      // Check if user.info.basic is in the granted scopes
      const grantedScopes = response.data.scope.split(",");
      const hasUserInfoBasic = grantedScopes.includes("user.info.basic");
      logger.info(
        "🔍 TikTok token exchange - Has user.info.basic scope:",
        hasUserInfoBasic
      );

      if (!hasUserInfoBasic) {
        logger.warn(
          "⚠️ TikTok token exchange - user.info.basic scope was NOT granted!"
        );
        logger.info(
          "🔍 TikTok token exchange - Granted scopes list:",
          grantedScopes
        );
      }
    }

    return response.data;
  } catch (error: any) {
    logger.error("❌ TikTok token exchange error:", error);
    if (error.response) {
      logger.error(
        "❌ TikTok token exchange - Response status:",
        error.response.status
      );
      logger.error(
        "❌ TikTok token exchange - Response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw new Error("Failed to exchange code for token");
  }
};

const refreshAccessToken = async (
  refreshToken: string
): Promise<TikTokTokenResponse> => {
  try {
    const params = new URLSearchParams();
    params.append("client_key", config.tiktok.clientKey);
    params.append("client_secret", config.tiktok.clientSecret);
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);

    const response = await axios.post(
      `${TIKTOK_API_BASE}/v2/oauth/token/`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.error("TikTok token refresh error:", error);
    throw new Error("Failed to refresh access token");
  }
};

const getBasicUserInfo = async (
  accessToken: string
): Promise<TikTokUserInfo> => {
  try {
    const url = `${TIKTOK_API_BASE}/v2/user/info/`;
    // Try with minimal fields first
    const params = {
      fields: "open_id,display_name",
    };

    logger.info(`🔍 TikTok getBasicUserInfo - URL: ${url}`);
    logger.info(
      `🔍 TikTok getBasicUserInfo - Access token: ${accessToken.substring(
        0,
        20
      )}...`
    );
    logger.info(`🔍 TikTok getBasicUserInfo - Fields: ${params.fields}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params,
    });

    logger.info(
      `✅ TikTok getBasicUserInfo - Success: ${JSON.stringify(response.data)}`
    );
    return response.data;
  } catch (error: any) {
    logger.error("❌ TikTok get basic user info error:", error);
    if (error.response) {
      logger.error(
        "❌ TikTok Basic API Response Status:",
        error.response.status
      );
      logger.error(
        "❌ TikTok Basic API Response Data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw new Error(
      `Failed to get basic user info: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
};

const getUserInfo = async (accessToken: string): Promise<TikTokUserInfo> => {
  try {
    const url = `${TIKTOK_API_BASE}/v2/user/info/`;
    const params = {
      fields:
        "open_id,union_id,avatar_url,avatar_url_100,avatar_url_200,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count",
    };

    logger.info(`🔍 TikTok getUserInfo - URL: ${url}`);
    logger.info(
      `🔍 TikTok getUserInfo - Access token: ${accessToken.substring(0, 20)}...`
    );
    logger.info(`🔍 TikTok getUserInfo - Full access token: ${accessToken}`);
    logger.info(`🔍 TikTok getUserInfo - Fields: ${params.fields}`);

    // Let's also decode the access token to see what scopes are actually granted
    const tokenParts = accessToken.split(".");
    if (tokenParts.length >= 2) {
      try {
        // TikTok tokens might contain scope info
        logger.info(`🔍 TikTok Access Token Parts: ${tokenParts.length} parts`);
        logger.info(`🔍 TikTok Access Token Part 1: ${tokenParts[0]}`);
        if (tokenParts[1]) {
          logger.info(`🔍 TikTok Access Token Part 2: ${tokenParts[1]}`);
        }
      } catch (e) {
        logger.info(`🔍 TikTok Access Token - Could not decode: ${e}`);
      }
    }

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params,
    });

    logger.info(
      `✅ TikTok getUserInfo - Success: ${JSON.stringify(response.data)}`
    );
    return response.data;
  } catch (error: any) {
    logger.error("❌ TikTok get user info error - Full error:", error);
    logger.error("❌ TikTok get user info error - Error name:", error.name);
    logger.error(
      "❌ TikTok get user info error - Error message:",
      error.message
    );

    if (error.response) {
      logger.error("❌ TikTok API Response Status:", error.response.status);
      logger.error(
        "❌ TikTok API Response Status Text:",
        error.response.statusText
      );
      logger.error(
        "❌ TikTok API Response Data:",
        JSON.stringify(error.response.data, null, 2)
      );
      logger.error(
        "❌ TikTok API Response Headers:",
        JSON.stringify(error.response.headers, null, 2)
      );

      // Check if it's a scope issue
      if (error.response.status === 401) {
        const errorData = error.response.data;
        if (errorData && errorData.error) {
          logger.error("❌ TikTok API Error Code:", errorData.error.code);
          logger.error("❌ TikTok API Error Message:", errorData.error.message);
          logger.error("❌ TikTok API Error Log ID:", errorData.error.log_id);
        }
      }
    } else if (error.request) {
      logger.error("❌ TikTok API - No response received:", error.request);
    } else {
      logger.error("❌ TikTok API - Request setup error:", error.message);
    }

    throw new Error(
      `Failed to get user info: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
};

const hasScopeGranted = (
  accessToken: string,
  requiredScope: string
): boolean => {
  try {
    // TikTok access tokens may contain scope information
    // We can also check from the token format if it's a limited scope token

    // Check if token has a specific format that indicates limited scope
    if (accessToken.includes("!") && accessToken.includes(".va")) {
      const tokenParts = accessToken.split("!");
      // This is a simplified check - in a real implementation,
      // you would store the granted scopes in the database during token exchange

      // For video.list scope, the token typically has a specific format
      if (requiredScope === "video.list") {
        // This is a simplified check - TikTok doesn't expose scope info in the token directly
        return !accessToken.includes("limited");
      }
    }

    // Default to false if we can't determine
    return false;
  } catch (error) {
    logger.error("❌ Error checking scope grant:", error);
    return false;
  }
};

const getUserVideos = async (
  accessToken: string,
  cursor?: string,
  maxCount: number = 20
): Promise<TikTokVideoData> => {
  try {
    // Check if the video.list scope is granted
    if (!hasScopeGranted(accessToken, "video.list")) {
      logger.warn("⚠️ User does not have video.list scope granted");
      throw new Error("VIDEO_PERMISSION_DENIED");
    }

    const url = `${TIKTOK_API_BASE}/v2/video/list/`;

    // TikTok video.list expects POST body with cursor / max_count.
    // Desired fields are added as query string to minimise payload.
    const queryString =
      "fields=id,title,cover_image_url,share_url,video_description,duration,height,width,create_time,view_count,like_count,comment_count,share_count";

    const body: Record<string, any> = {
      max_count: maxCount,
    };

    if (cursor) {
      body.cursor = cursor;
    }

    logger.info(`🔍 TikTok getUserVideos - URL: ${url}?${queryString}`);
    logger.info(
      `🔍 TikTok getUserVideos - Access token: ${accessToken.substring(
        0,
        20
      )}...`
    );
    logger.info(`🔍 TikTok getUserVideos - Body: ${JSON.stringify(body)}`);

    const response = await axios.post(`${url}?${queryString}`, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    logger.info(
      `✅ TikTok getUserVideos - Success: ${JSON.stringify(response.data)}`
    );
    return response.data;
  } catch (error: any) {
    logger.error("❌ TikTok get user videos error:", error);

    // Handle specific error types
    if (error.message === "VIDEO_PERMISSION_DENIED") {
      throw new Error(
        "TikTok video access permission not granted. Please reconnect your TikTok account with video permissions."
      );
    }

    if (error.response) {
      logger.error(
        "❌ TikTok Videos API Response Status:",
        error.response.status
      );
      logger.error(
        "❌ TikTok Videos API Response Data:",
        JSON.stringify(error.response.data, null, 2)
      );

      // Check for specific TikTok API errors
      if (error.response.status === 404) {
        throw new Error(
          "TikTok video access permission not granted or no videos available. Please reconnect your TikTok account with video permissions."
        );
      }
    }

    throw new Error(
      `Failed to get user videos: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
};

const getVideoDetails = async (
  accessToken: string,
  videoId: string
): Promise<any> => {
  try {
    const response = await axios.get(`${TIKTOK_API_BASE}/v2/video/query/`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params: {
        video_ids: videoId,
        fields:
          "id,title,cover_image_url,share_url,video_description,duration,height,width,create_time,view_count,like_count,comment_count,share_count",
      },
    });

    return response.data;
  } catch (error) {
    logger.error("TikTok get video details error:", error);
    throw new Error("Failed to get video details");
  }
};

const uploadVideo = async (
  accessToken: string,
  videoData: any
): Promise<any> => {
  try {
    // This is a simplified version - actual implementation would be more complex
    // involving multiple steps: initiate upload, upload chunks, complete upload
    const response = await axios.post(
      `${TIKTOK_API_BASE}/v2/post/publish/video/init/`,
      videoData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.error("TikTok upload video error:", error);
    throw new Error("Failed to upload video");
  }
};

const searchVideosByHashtag = async (
  hashtag: string,
  count: number = 50
): Promise<any> => {
  try {
    // Note: This would require TikTok Research API access
    // For now, this is a placeholder implementation
    logger.warn(
      "TikTok hashtag search not implemented - requires Research API access"
    );

    return {
      data: {
        videos: [],
        has_more: false,
        cursor: "",
      },
    };
  } catch (error) {
    logger.error("TikTok search videos error:", error);
    throw new Error("Failed to search videos by hashtag");
  }
};

const scrapeVideoData = async (videoUrl: string): Promise<any> => {
  try {
    logger.info(`Scraping TikTok video data from URL: ${videoUrl}`);

    // First try to get data from TikTok API if we have credentials
    if (config.tiktok.clientKey && config.tiktok.clientSecret) {
      try {
        logger.info("Attempting to use TikTok API for video data");
        // Extract video ID from URL
        const urlObj = new URL(videoUrl);
        const pathParts = urlObj.pathname.split("/");
        const videoIndex = pathParts.indexOf("video");
        let videoId = null;

        if (videoIndex !== -1 && videoIndex + 1 < pathParts.length) {
          videoId = pathParts[videoIndex + 1];
        }

        if (videoId) {
          logger.info(`Extracted video ID: ${videoId}`);

          // Try to fetch video data from TikTok API
          // This would require proper API access and implementation
          // For now, we'll fall back to web scraping
        }
      } catch (apiError) {
        logger.error("Error using TikTok API:", apiError);
        // Continue to web scraping approach
      }
    }

    // Web scraping approach
    logger.info("Using web scraping approach for TikTok video data");

    // Make request to TikTok video page
    const response = await axios.get(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
    });

    const html = response.data;
    logger.info("Successfully fetched TikTok video page");

    // Try to extract JSON data from the page
    // TikTok typically embeds video data in a JSON script tag
    let videoData = null;
    let statsData = {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };

    try {
      // Look for embedded JSON data
      const jsonMatch = html.match(
        /<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/
      );
      if (jsonMatch && jsonMatch[1]) {
        const jsonData = JSON.parse(jsonMatch[1]);
        logger.info("Found embedded JSON data in TikTok page");

        // Navigate through the JSON structure to find video stats
        // The exact path may vary depending on TikTok's current structure
        const itemKey = Object.keys(jsonData.ItemModule)[0];
        if (itemKey && jsonData.ItemModule[itemKey]) {
          const item = jsonData.ItemModule[itemKey];

          // Extract video details
          videoData = {
            id: item.id,
            title: item.desc || "TikTok Video",
            author: item.nickname || item.uniqueId || "Unknown",
            description: item.desc || "",
          };

          // Extract stats
          statsData = {
            views: parseInt(item.stats?.playCount || 0),
            likes: parseInt(item.stats?.diggCount || 0),
            comments: parseInt(item.stats?.commentCount || 0),
            shares: parseInt(item.stats?.shareCount || 0),
          };

          logger.info(`Extracted video stats: ${JSON.stringify(statsData)}`);
        }
      }
    } catch (jsonError) {
      logger.error("Error extracting JSON data from TikTok page:", jsonError);
    }

    // If JSON extraction failed, try regex-based extraction
    if (!videoData) {
      logger.info("Attempting regex-based extraction of TikTok stats");

      // Try to extract view count
      const viewMatch = html.match(/"playCount":(\d+)/);
      if (viewMatch && viewMatch[1]) {
        statsData.views = parseInt(viewMatch[1]);
      }

      // Try to extract like count
      const likeMatch = html.match(/"diggCount":(\d+)/);
      if (likeMatch && likeMatch[1]) {
        statsData.likes = parseInt(likeMatch[1]);
      }

      // Try to extract comment count
      const commentMatch = html.match(/"commentCount":(\d+)/);
      if (commentMatch && commentMatch[1]) {
        statsData.comments = parseInt(commentMatch[1]);
      }

      // Try to extract share count
      const shareMatch = html.match(/"shareCount":(\d+)/);
      if (shareMatch && shareMatch[1]) {
        statsData.shares = parseInt(shareMatch[1]);
      }

      // Extract basic video info
      const titleMatch = html.match(
        /<meta name="description" content="([^"]+)"/
      );
      const title = titleMatch ? titleMatch[1] : "TikTok Video";

      const authorMatch = html.match(/<meta name="author" content="([^"]+)"/);
      const author = authorMatch ? authorMatch[1] : "Unknown";

      videoData = {
        title,
        author,
        description: title,
      };

      logger.info(
        `Extracted video stats via regex: ${JSON.stringify(statsData)}`
      );
    }

    return {
      url: videoUrl,
      title: videoData?.title || "TikTok Video",
      description: videoData?.description || "",
      author: videoData?.author || "Unknown",
      stats: statsData,
    };
  } catch (error) {
    logger.error("TikTok scrape video error:", error);

    // Return default values if scraping fails
    return {
      url: videoUrl,
      title: "TikTok Video",
      description: "Could not retrieve video description",
      author: "Unknown",
      stats: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      },
    };
  }
};

export const tiktokService = {
  exchangeCodeForToken,
  refreshAccessToken,
  getBasicUserInfo,
  getUserInfo,
  getUserVideos,
  getVideoDetails,
  uploadVideo,
  searchVideosByHashtag,
  scrapeVideoData,
  hasScopeGranted,
};
