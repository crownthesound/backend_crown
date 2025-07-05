import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";
import { CustomError, catchAsync } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

const getAllContests = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { data: contests, error } = await supabase
      .from("contests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Get contests error:", error);
      return next(new CustomError("Error fetching contests", 500));
    }

    res.status(200).json({
      status: "success",
      results: contests.length,
      data: {
        contests,
      },
    });
  }
);

const getActiveContests = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const now = new Date().toISOString();

    const { data: contests, error } = await supabase
      .from("contests")
      .select("*")
      .eq("status", "active")
      .lte("start_date", now)
      .gte("end_date", now)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Get active contests error:", error);
      return next(new CustomError("Error fetching active contests", 500));
    }

    res.status(200).json({
      status: "success",
      results: contests.length,
      data: {
        contests,
      },
    });
  }
);

const getContest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const { data: contest, error } = await supabase
      .from("contests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error("Get contest error:", error);
      return next(new CustomError("Contest not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        contest,
      },
    });
  }
);

const getLeaderboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    // Optional ?limit query param, default to 50
    const limit = Number(req.query.limit as string) || 50;

    // Fetch the TikTok submissions for the contest ordered by current view count
    const { data: submissions, error } = await supabase
      .from("contest_links")
      .select(
        "id, username, views, likes, comments, shares, thumbnail, url, title, created_at, embed_code, tiktok_video_id"
      )
      .eq("contest_id", id)
      .eq("is_contest_submission", true)
      .order("views", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Fetch leaderboard error:", error);
      return next(new CustomError("Error fetching leaderboard", 500));
    }

    // Build ranked response
    const leaderboard = (submissions || []).map((submission, index) => ({
      rank: index + 1,
      ...submission,
    }));

    res.status(200).json({
      status: "success",
      data: {
        leaderboard,
        contest_id: id,
      },
    });
  }
);

const createContest = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const contestData = {
      ...req.body,
      created_by: req.user!.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: contest, error } = await supabase
      .from("contests")
      .insert(contestData)
      .select()
      .single();

    if (error) {
      logger.error("Create contest error:", error);
      return next(new CustomError("Error creating contest", 500));
    }

    res.status(201).json({
      status: "success",
      data: {
        contest,
      },
    });
  }
);

const updateContest = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString(),
    };

    const { data: contest, error } = await supabase
      .from("contests")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Update contest error:", error);
      return next(new CustomError("Error updating contest", 500));
    }

    res.status(200).json({
      status: "success",
      data: {
        contest,
      },
    });
  }
);

const deleteContest = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const { error } = await supabase.from("contests").delete().eq("id", id);

    if (error) {
      logger.error("Delete contest error:", error);
      return next(new CustomError("Error deleting contest", 500));
    }

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);

const joinContest = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    // Implementation would depend on your contest participation logic
    // This is a placeholder
    res.status(200).json({
      status: "success",
      message: "Successfully joined contest",
      data: {
        contest_id: id,
        user_id: req.user!.id,
      },
    });
  }
);

const submitVideo = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { videoUrl, description } = req.body;

    if (!videoUrl) {
      return next(new CustomError("Video URL is required", 400));
    }

    // Implementation would depend on your video submission logic
    // This is a placeholder
    res.status(201).json({
      status: "success",
      message: "Video submitted successfully",
      data: {
        contest_id: id,
        user_id: req.user!.id,
        video_url: videoUrl,
        description,
      },
    });
  }
);

const getMySubmissions = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    // Implementation would depend on your submissions table structure
    // This is a placeholder
    res.status(200).json({
      status: "success",
      data: {
        submissions: [],
        contest_id: id,
        user_id: req.user!.id,
      },
    });
  }
);

const getAllSubmissions = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    // Implementation would depend on your submissions table structure
    // This is a placeholder
    res.status(200).json({
      status: "success",
      data: {
        submissions: [],
        contest_id: id,
      },
    });
  }
);

const updateContestStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return next(new CustomError("Status is required", 400));
    }

    const { data: contest, error } = await supabase
      .from("contests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Update contest status error:", error);
      return next(new CustomError("Error updating contest status", 500));
    }

    res.status(200).json({
      status: "success",
      data: {
        contest,
      },
    });
  }
);

const approveSubmission = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id, submissionId } = req.params;

    // Implementation would depend on your submissions table structure
    // This is a placeholder
    res.status(200).json({
      status: "success",
      message: "Submission approved successfully",
      data: {
        contest_id: id,
        submission_id: submissionId,
      },
    });
  }
);

const rejectSubmission = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id, submissionId } = req.params;
    const { reason } = req.body;

    // Implementation would depend on your submissions table structure
    // This is a placeholder
    res.status(200).json({
      status: "success",
      message: "Submission rejected successfully",
      data: {
        contest_id: id,
        submission_id: submissionId,
        reason,
      },
    });
  }
);

export const contestController = {
  getAllContests,
  getActiveContests,
  getContest,
  getLeaderboard,
  createContest,
  updateContest,
  deleteContest,
  joinContest,
  submitVideo,
  getMySubmissions,
  getAllSubmissions,
  updateContestStatus,
  approveSubmission,
  rejectSubmission,
};
