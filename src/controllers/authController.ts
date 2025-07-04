import { Request, Response, NextFunction } from "express";
import { supabase, supabaseAdmin } from "@/config/supabase";
import { CustomError, catchAsync } from "@/middleware/errorHandler";
import { logger } from "@/utils/logger";
import { AuthenticatedRequest } from "@/middleware/authMiddleware";

const signup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return next(new CustomError("Email and password are required", 400));
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      logger.error("Signup error:", error);
      return next(new CustomError(error.message, 400));
    }

    res.status(201).json({
      status: "success",
      message:
        "User created successfully. Please check your email for verification.",
      data: {
        user: data.user,
        session: data.session,
      },
    });
  }
);

const signin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new CustomError("Email and password are required", 400));
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.error("Signin error:", error);
      return next(new CustomError("Invalid email or password", 401));
    }

    res.status(200).json({
      status: "success",
      data: {
        user: data.user,
        session: data.session,
      },
    });
  }
);

const signout = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.error("Signout error:", error);
      return next(new CustomError("Error signing out", 500));
    }

    res.status(200).json({
      status: "success",
      message: "Signed out successfully",
    });
  }
);

const refreshToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new CustomError("Refresh token is required", 400));
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      logger.error("Token refresh error:", error);
      return next(new CustomError("Invalid refresh token", 401));
    }

    res.status(200).json({
      status: "success",
      data: {
        session: data.session,
      },
    });
  }
);

const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email) {
      return next(new CustomError("Email is required", 400));
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      logger.error("Password reset error:", error);
      return next(new CustomError("Error sending password reset email", 500));
    }

    res.status(200).json({
      status: "success",
      message: "Password reset email sent",
    });
  }
);

const resetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { password, accessToken } = req.body;

    if (!password || !accessToken) {
      return next(
        new CustomError("Password and access token are required", 400)
      );
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      logger.error("Password update error:", error);
      return next(new CustomError("Error updating password", 500));
    }

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
    });
  }
);

const getMe = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.user!.id)
      .single();

    if (error) {
      logger.error("Profile fetch error:", error);
      return next(new CustomError("Error fetching profile", 500));
    }

    res.status(200).json({
      status: "success",
      data: {
        profile,
      },
    });
  }
);

const updateProfile = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { fullName, email } = req.body;

    const updates: any = {};
    if (fullName) updates.full_name = fullName;
    if (email) updates.email = email;

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", req.user!.id)
      .select()
      .single();

    if (error) {
      logger.error("Profile update error:", error);
      return next(new CustomError("Error updating profile", 500));
    }

    res.status(200).json({
      status: "success",
      data: {
        profile: data,
      },
    });
  }
);

const updatePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(
        new CustomError("Current password and new password are required", 400)
      );
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.user!.email!,
      password: currentPassword,
    });

    if (verifyError) {
      return next(new CustomError("Current password is incorrect", 400));
    }

    // Update password
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      logger.error("Password update error:", error);
      return next(new CustomError("Error updating password", 500));
    }

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
    });
  }
);

export const authController = {
  signup,
  signin,
  signout,
  refreshToken,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  updatePassword,
};
