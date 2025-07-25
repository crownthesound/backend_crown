import { Router, Request, Response } from "express";
import cors from "cors";
import { tiktokController } from "../controllers/tiktokController";
import { authMiddleware } from "../middleware/authMiddleware";
import { logger } from "../utils/logger";

const router = Router();

// Special CORS handlers for TikTok endpoints
const corsHandler = (req: Request, res: Response) => {
  logger.info(`TikTok ${req.originalUrl} OPTIONS request received`);
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, Cache-Control"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.status(200).send();
};

router.options("/auth", corsHandler);
router.options("/auth/callback", corsHandler);
router.options("/auth/initiate", corsHandler);
router.options("/profile/save", corsHandler);
router.options("/profile", corsHandler);
router.options("/profile/disconnect", corsHandler);
router.options("/accounts", corsHandler);
router.options("/accounts/set-primary", corsHandler);
router.options("/accounts/:id", corsHandler);
router.options("/accounts/:id/validate", corsHandler);
router.options("/accounts/:id/establish-session", corsHandler);
router.options("/accounts/cleanup-contaminated", corsHandler);
router.options("/videos", corsHandler);
router.options("/videos/upload", corsHandler);
router.options("/videos/download", corsHandler);

// Simple test route
router.get("/test", (req: Request, res: Response) => {
  logger.info("TikTok test route accessed");
  res.status(200).json({
    status: "success",
    message: "TikTok routes are working",
    timestamp: new Date().toISOString(),
  });
});

// TikTok OAuth routes
router.get("/auth/clear-session", tiktokController.clearTikTokSession);
router.get("/auth", tiktokController.initiateAuth); // No auth required for direct browser access
router.post("/auth/initiate", authMiddleware, tiktokController.initiateAuth); // Auth required for API calls
router.get("/auth/callback", tiktokController.handleCallback);

// Protected TikTok API routes
router.post(
  "/profile/save",
  authMiddleware,
  tiktokController.saveTikTokProfile
);
router.get("/profile", authMiddleware, tiktokController.getUserProfile);
router.post(
  "/profile/disconnect",
  authMiddleware,
  tiktokController.disconnectTikTokProfile
);

// Multi-account TikTok API routes
router.get("/accounts", authMiddleware, tiktokController.getUserTikTokAccounts);
router.post("/accounts/set-primary", authMiddleware, tiktokController.setPrimaryTikTokAccount);
router.get("/accounts/:id/validate", authMiddleware, tiktokController.validateTikTokAccountSession);
router.post("/accounts/:id/establish-session", authMiddleware, tiktokController.establishTikTokSession);
router.delete("/accounts/:id", authMiddleware, tiktokController.deleteTikTokAccount);
router.post("/accounts/cleanup-contaminated", authMiddleware, tiktokController.scanAndCleanupContaminatedTokens);
router.post("/videos", authMiddleware, tiktokController.getUserVideos); // Changed to POST to match client expectations
router.post("/videos/upload", authMiddleware, tiktokController.uploadVideo); // Renamed to avoid conflict
router.post("/videos/download", authMiddleware, tiktokController.downloadVideo); // New download endpoint
router.post("/videos/test-download", authMiddleware, tiktokController.testVideoDownload); // Test endpoint for debugging
router.get(
  "/videos/:videoId",
  authMiddleware,
  tiktokController.getVideoDetails
);

// Public TikTok API routes (for contest videos)
router.get("/contest-videos", tiktokController.getContestVideos);
router.post("/scrape-video", tiktokController.scrapeVideoData);

// Route for updating redirect URI
router.post("/update-redirect-uri", tiktokController.updateRedirectUri);

export default router;
