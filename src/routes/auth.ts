import { Router } from "express";
import { authController } from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// Public routes
router.post("/signup", authController.signup);
router.post("/signin", authController.signin);
router.post("/signout", authController.signout);
router.post("/refresh", authController.refreshToken);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// Protected routes
router.get("/me", authMiddleware, authController.getMe);
router.patch("/update-profile", authMiddleware, authController.updateProfile);
router.patch("/update-password", authMiddleware, authController.updatePassword);

export default router;
