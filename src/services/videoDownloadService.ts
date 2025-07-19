import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import axios from 'axios';

interface VideoDownloadResult {
  publicUrl: string;
  fileName: string;
  fileSize?: number;
  logs?: VideoDownloadLog[];
}

interface VideoDownloadOptions {
  videoUrl: string;
  videoId: string;
  userId: string;
}

interface VideoDownloadLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
  step?: string;
}

interface VideoDownloadProgress {
  step: number;
  totalSteps: number;
  stepName: string;
  status: 'in_progress' | 'completed' | 'failed';
  message: string;
  details?: any;
  logs: VideoDownloadLog[];
}

export class VideoDownloadService {
  private static readonly BUCKET_NAME = 'tiktok-videos';
  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  private static logs: VideoDownloadLog[] = [];
  
  private static addLog(level: VideoDownloadLog['level'], message: string, details?: any, step?: string) {
    const log: VideoDownloadLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
      step
    };
    
    this.logs.push(log);
    
    // Also log to the regular logger
    switch (level) {
      case 'info':
        logger.info(message, details);
        break;
      case 'warn':
        logger.warn(message, details);
        break;
      case 'error':
        logger.error(message, details);
        break;
      case 'success':
        logger.info(`✅ ${message}`, details);
        break;
    }
  }
  
  private static resetLogs() {
    this.logs = [];
  }
  
  private static getLogs(): VideoDownloadLog[] {
    return [...this.logs];
  }

  /**
   * Verifies that the Supabase bucket exists and is accessible
   */
  private static async verifySupabaseBucket(): Promise<void> {
    try {
      // Try to list files in the bucket to verify access
      const { data, error } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .list('', { limit: 1 });

      if (error) {
        throw new Error(`Supabase bucket verification failed: ${error.message}`);
      }

      // Check if we can get bucket info
      const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
      
      if (bucketsError) {
        throw new Error(`Failed to list buckets: ${bucketsError.message}`);
      }

      const targetBucket = buckets.find(bucket => bucket.name === this.BUCKET_NAME);
      
      if (!targetBucket) {
        throw new Error(`Bucket '${this.BUCKET_NAME}' does not exist. Available buckets: ${buckets.map(b => b.name).join(', ')}`);
      }

      logger.info(`✅ Bucket verification successful:`, {
        bucketName: this.BUCKET_NAME,
        bucketId: targetBucket.id,
        bucketPublic: targetBucket.public,
        bucketCreatedAt: targetBucket.created_at
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Supabase bucket verification failed:`, {
        bucketName: this.BUCKET_NAME,
        error: errorMessage
      });
      throw new Error(`Bucket verification failed: ${errorMessage}`);
    }
  }

  /**
   * Downloads a TikTok video and stores it in Supabase storage
   */
  static async downloadAndStoreVideo(options: VideoDownloadOptions): Promise<VideoDownloadResult> {
    const { videoUrl, videoId, userId } = options;
    
    // Reset logs for this operation
    this.resetLogs();
    
    this.addLog('info', `Starting video download for URL: ${videoUrl}`, {
      videoId,
      userId,
      bucketName: this.BUCKET_NAME
    }, 'initialization');
    
    let fileName: string | null = null;
    
    try {
      // Validate inputs
      if (!videoUrl || !videoId || !userId) {
        throw new Error('Missing required parameters: videoUrl, videoId, and userId are all required');
      }
      
      this.addLog('info', 'Input validation passed', { videoId, userId }, 'validation');
      
      // Verify Supabase bucket exists and is accessible
      this.addLog('info', 'Verifying Supabase bucket...', { bucketName: this.BUCKET_NAME }, 'bucket_verification');
      await this.verifySupabaseBucket();
      this.addLog('success', 'Supabase bucket verification passed', { bucketName: this.BUCKET_NAME }, 'bucket_verification');

      // Generate unique filename
      fileName = `${userId}_${videoId}_${Date.now()}_${uuidv4()}.mp4`;
      this.addLog('info', `Generated filename: ${fileName}`, { fileName }, 'filename_generation');
      
      // Download video stream
      this.addLog('info', 'Step 1/3: Starting video stream download...', { videoUrl }, 'download_start');
      const videoStream = await this.downloadVideoStream(videoUrl);
      this.addLog('success', 'Step 1/3 completed: Got video stream', {}, 'download_complete');
      
      // Upload to Supabase storage
      this.addLog('info', 'Step 2/3: Starting upload to Supabase storage...', { fileName, bucketName: this.BUCKET_NAME }, 'upload_start');
      const publicUrl = await this.uploadToSupabase(videoStream, fileName);
      this.addLog('success', 'Step 2/3 completed: Uploaded to Supabase', { publicUrl }, 'upload_complete');
      
      // Verify upload
      this.addLog('info', 'Step 3/3: Verifying upload...', {}, 'verification_start');
      if (!publicUrl) {
        throw new Error('Upload succeeded but no public URL was returned');
      }
      this.addLog('success', 'Step 3/3 completed: Upload verified', { publicUrl }, 'verification_complete');
      
      const result: VideoDownloadResult = {
        publicUrl,
        fileName,
        logs: this.getLogs()
      };
      
      this.addLog('success', 'Video download and storage completed successfully!', {
        publicUrl,
        fileName,
        videoId,
        userId
      }, 'completion');
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog('error', `Video download failed: ${errorMessage}`, {
        error: errorMessage,
        videoUrl,
        videoId,
        userId,
        fileName,
        step: 'download_and_store'
      }, 'error');
      
      // If we created a file but failed later, try to clean it up
      if (fileName) {
        try {
          this.addLog('info', `Attempting to clean up failed upload: ${fileName}`, { fileName }, 'cleanup');
          await this.deleteVideo(fileName);
          this.addLog('success', `Successfully cleaned up failed upload: ${fileName}`, { fileName }, 'cleanup');
        } catch (cleanupError) {
          this.addLog('warn', `Failed to clean up file ${fileName}`, { 
            fileName, 
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) 
          }, 'cleanup');
        }
      }
      
      // Include logs in the error so they can be sent to frontend
      const enrichedError = new Error(errorMessage);
      (enrichedError as any).logs = this.getLogs();
      
      throw enrichedError;
    }
  }

  /**
   * Downloads video stream from TikTok URL
   */
  private static async downloadVideoStream(videoUrl: string): Promise<Readable> {
    try {
      logger.info(`🔍 Downloading video stream from: ${videoUrl}`);
      
      // Validate URL format
      if (!videoUrl || typeof videoUrl !== 'string') {
        throw new Error('Invalid video URL provided');
      }
      
      // Make HTTP request to download video
      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        timeout: this.TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'video/mp4,video/*,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'video',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
        },
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });
      
      if (!response.data) {
        throw new Error('No video data received from URL');
      }
      
      // Check content type
      const contentType = response.headers['content-type'];
      if (contentType && !contentType.includes('video/') && !contentType.includes('application/octet-stream')) {
        logger.warn(`⚠️ Unexpected content type: ${contentType}`);
      }
      
      // Get content length for logging
      const contentLength = response.headers['content-length'];
      if (contentLength) {
        const sizeInMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
        logger.info(`📊 Video size: ${sizeInMB}MB`);
        
        if (parseInt(contentLength) > this.MAX_FILE_SIZE) {
          throw new Error(`Video file too large: ${sizeInMB}MB (max: ${(this.MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)}MB)`);
        }
      }
      
      logger.info(`✅ Video stream download started successfully`);
      return response.data as Readable;
      
    } catch (error) {
      logger.error(`❌ Failed to download video stream:`, error);
      
      // Provide more specific error messages
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Video download timed out - the video may be too large or the server is slow');
        } else if (error.response?.status === 403) {
          throw new Error('Access denied - the video URL may be invalid or restricted');
        } else if (error.response?.status === 404) {
          throw new Error('Video not found - the URL may be expired or incorrect');
        } else if (error.response?.status && error.response.status >= 500) {
          throw new Error('Video server error - please try again later');
        } else {
          throw new Error(`HTTP ${error.response?.status || 'unknown'}: ${error.message}`);
        }
      }
      
      throw new Error(`Failed to download video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Uploads video stream to Supabase storage
   */
  private static async uploadToSupabase(videoStream: Readable, fileName: string): Promise<string> {
    try {
      logger.info(`🔍 Uploading video to Supabase: ${fileName}`);
      
      // Convert stream to buffer with size limit
      logger.info(`🔍 Converting stream to buffer...`);
      const buffer = await this.streamToBuffer(videoStream);
      
      const sizeInMB = (buffer.length / (1024 * 1024)).toFixed(2);
      logger.info(`📊 Buffer size: ${sizeInMB}MB`);
      
      if (buffer.length > this.MAX_FILE_SIZE) {
        throw new Error(`Video file too large: ${sizeInMB}MB (max: ${(this.MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)}MB)`);
      }
      
      if (buffer.length === 0) {
        throw new Error('Video buffer is empty - no data received');
      }
      
      // Upload to Supabase storage
      logger.info(`🔍 Uploading ${sizeInMB}MB to Supabase bucket '${this.BUCKET_NAME}'...`);
      const { data, error } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .upload(fileName, buffer, {
          contentType: 'video/mp4',
          upsert: false,
        });
      
      if (error) {
        logger.error(`❌ Supabase upload error:`, {
          error: error.message,
          fileName,
          bucketName: this.BUCKET_NAME,
          fileSize: sizeInMB + 'MB'
        });
        throw new Error(`Upload failed: ${error.message}`);
      }
      
      if (!data || !data.path) {
        throw new Error('Upload succeeded but no data path returned');
      }
      
      logger.info(`✅ File uploaded to path: ${data.path}`);
      
      // Get public URL
      logger.info(`🔍 Getting public URL for file...`);
      const { data: publicUrlData } = supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);
      
      if (!publicUrlData?.publicUrl) {
        throw new Error('Failed to get public URL');
      }
      
      logger.info(`✅ Video uploaded successfully to Supabase storage!`, {
        fileName,
        publicUrl: publicUrlData.publicUrl,
        fileSize: sizeInMB + 'MB',
        bucketPath: data.path
      });
      
      return publicUrlData.publicUrl;
    } catch (error) {
      logger.error(`❌ Failed to upload to Supabase:`, {
        error: error instanceof Error ? error.message : String(error),
        fileName,
        bucketName: this.BUCKET_NAME
      });
      throw error;
    }
  }

  /**
   * Converts stream to buffer with size limit
   */
  private static async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      
      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        
        if (totalSize > this.MAX_FILE_SIZE) {
          stream.destroy();
          reject(new Error(`Video file too large: ${totalSize} bytes (max: ${this.MAX_FILE_SIZE})`));
          return;
        }
        
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
      
      // Set timeout
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Video download timeout'));
      }, this.TIMEOUT);
      
      stream.on('end', () => clearTimeout(timeout));
      stream.on('error', () => clearTimeout(timeout));
    });
  }

  /**
   * Deletes a video file from Supabase storage
   */
  static async deleteVideo(fileName: string): Promise<void> {
    try {
      logger.info(`🗑️ Deleting video: ${fileName}`);
      
      const { error } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .remove([fileName]);
      
      if (error) {
        logger.error(`❌ Failed to delete video:`, error);
        throw new Error(`Delete failed: ${error.message}`);
      }
      
      logger.info(`✅ Video deleted successfully: ${fileName}`);
    } catch (error) {
      logger.error(`❌ Failed to delete video:`, error);
      throw error;
    }
  }
}