import { Router } from "express";
import { contestController } from "@/controllers/contestController";
import { authMiddleware, restrictTo } from "@/middleware/authMiddleware";

const router = Router();

// Public routes
router.get("/", contestController.getAllContests);
router.get("/active", contestController.getActiveContests);
router.get("/:id", contestController.getContest);
router.get("/:id/leaderboard", contestController.getLeaderboard);

// Protected routes
router.use(authMiddleware);

// User routes
router.post("/:id/join", contestController.joinContest);
router.post("/:id/submit-video", contestController.submitVideo);
router.get("/:id/my-submissions", contestController.getMySubmissions);

// Admin/Organizer routes
router.use(restrictTo("admin", "organizer"));
router.post("/", contestController.createContest);
router.patch("/:id", contestController.updateContest);
router.delete("/:id", contestController.deleteContest);
router.patch("/:id/status", contestController.updateContestStatus);
router.get("/:id/submissions", contestController.getAllSubmissions);
router.patch(
  "/:id/submissions/:submissionId/approve",
  contestController.approveSubmission
);
router.patch(
  "/:id/submissions/:submissionId/reject",
  contestController.rejectSubmission
);

export default router;
