import { Request, Response, NextFunction } from "express";
import { supabase } from "@/config/supabase";
import { CustomError, catchAsync } from "./errorHandler";
import { logger } from "@/utils/logger";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

export const authMiddleware = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1) Get token from header
    let token: string | undefined;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new CustomError(
          "You are not logged in! Please log in to get access.",
          401
        )
      );
    }

    try {
      // 2) Verify token with Supabase
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        logger.error("Token verification failed:", error);
        return next(
          new CustomError("Invalid token. Please log in again!", 401)
        );
      }

      // 3) Get user profile from database
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        logger.error("Profile fetch failed:", profileError);
        return next(new CustomError("User profile not found.", 404));
      }

      // 4) Attach user to request object
      req.user = {
        id: user.id,
        email: user.email,
        role: profile.role || "user",
      };

      next();
    } catch (error) {
      logger.error("Auth middleware error:", error);
      return next(new CustomError("Authentication failed.", 401));
    }
  }
);

export const restrictTo = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role || "user")) {
      return next(
        new CustomError(
          "You do not have permission to perform this action",
          403
        )
      );
    }
    next();
  };
};
