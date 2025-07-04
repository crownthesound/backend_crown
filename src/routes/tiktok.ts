import { Router, Request, Response } from "express";
import cors from "cors";
import { tiktokController } from "@/controllers/tiktokController";
import { authMiddleware } from "@/middleware/authMiddleware";
import { logger } from "@/utils/logger";

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
router.options("/videos", corsHandler);
router.options("/videos/upload", corsHandler);

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
router.get("/auth", tiktokController.initiateAuth);
router.post("/auth/initiate", tiktokController.initiateAuth);
router.get("/auth/callback", tiktokController.handleCallback);

// Protected TikTok API routes
router.post(
  "/profile/save",
  authMiddleware,
  tiktokController.saveTikTokProfile
);
router.get("/profile", authMiddleware, tiktokController.getUserProfile);
router.post("/videos", authMiddleware, tiktokController.getUserVideos); // Changed to POST to match client expectations
router.post("/videos/upload", authMiddleware, tiktokController.uploadVideo); // Renamed to avoid conflict
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
