import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import axios from 'axios';

interface VideoDownloadResult {
  publicUrl: string;
  fileName: string;
  fileSize?: number;
}

interface VideoDownloadOptions {
  videoUrl: string;
  videoId: string;
  userId: string;
}

export class VideoDownloadService {
  private static readonly BUCKET_NAME = 'tiktok-videos';
  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly TIMEOUT = 5 * 60 * 1000; // 5 minutes

  /**
   * Downloads a TikTok video and stores it in Supabase storage
   */
  static async downloadAndStoreVideo(options: VideoDownloadOptions): Promise<VideoDownloadResult> {
    const { videoUrl, videoId, userId } = options;
    
    logger.info(`🔍 Starting video download for URL: ${videoUrl}`);
    
    try {
      // Generate unique filename
      const fileName = `${userId}_${videoId}_${uuidv4()}.mp4`;
      
      // Download video stream
      const videoStream = await this.downloadVideoStream(videoUrl);
      
      // Upload to Supabase storage
      const publicUrl = await this.uploadToSupabase(videoStream, fileName);
      
      logger.info(`✅ Video download completed successfully: ${publicUrl}`);
      
      return {
        publicUrl,
        fileName,
      };
    } catch (error) {
      logger.error(`❌ Video download failed for URL: ${videoUrl}`, error);
      logger.error(`❌ Error details:`, {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      throw error;
    }
  }

  /**
   * Downloads video stream from TikTok URL using web scraping approach
   */
  private static async downloadVideoStream(videoUrl: string): Promise<Readable> {
    try {
      logger.info(`🔍 Downloading video stream from: ${videoUrl}`);
      
      // First, get the TikTok page to extract video download URL
      const pageResponse = await axios.get(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });
      
      const html = pageResponse.data;
      logger.info(`🔍 Got TikTok page HTML, length: ${html.length}`);
      
      // Extract video download URL from the page
      let videoDownloadUrl = null;
      
      // Try to find the video URL in the page source
      const videoUrlPattern = /"downloadAddr":"([^"]+)"/;
      const match = html.match(videoUrlPattern);
      
      if (match && match[1]) {
        videoDownloadUrl = match[1].replace(/\\u002F/g, '/');
        logger.info(`🔍 Found video download URL: ${videoDownloadUrl}`);
      } else {
        // Try alternative patterns
        const altPattern = /"playAddr":"([^"]+)"/;
        const altMatch = html.match(altPattern);
        
        if (altMatch && altMatch[1]) {
          videoDownloadUrl = altMatch[1].replace(/\\u002F/g, '/');
          logger.info(`🔍 Found alternative video URL: ${videoDownloadUrl}`);
        }
      }
      
      if (!videoDownloadUrl) {
        throw new Error('Could not extract video download URL from TikTok page');
      }
      
      // Download the video file
      const response = await axios({
        method: 'GET',
        url: videoDownloadUrl,
        responseType: 'stream',
        timeout: this.TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.tiktok.com/',
        }
      });
      
      if (!response.data) {
        throw new Error('Failed to get video stream');
      }
      
      logger.info(`🔍 Successfully got video stream, content-length: ${response.headers['content-length'] || 'unknown'}`);
      
      return response.data;
    } catch (error) {
      logger.error(`❌ Failed to download video stream:`, error);
      logger.error(`❌ Stream download error details:`, {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
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
      const buffer = await this.streamToBuffer(videoStream);
      
      if (buffer.length > this.MAX_FILE_SIZE) {
        throw new Error(`Video file too large: ${buffer.length} bytes (max: ${this.MAX_FILE_SIZE})`);
      }
      
      // Upload to Supabase storage
      const { data, error } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .upload(fileName, buffer, {
          contentType: 'video/mp4',
          upsert: false,
        });
      
      if (error) {
        logger.error(`❌ Supabase upload error:`, error);
        throw new Error(`Upload failed: ${error.message}`);
      }
      
      // Get public URL
      const { data: publicUrlData } = supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);
      
      if (!publicUrlData.publicUrl) {
        throw new Error('Failed to get public URL');
      }
      
      logger.info(`✅ Video uploaded successfully: ${publicUrlData.publicUrl}`);
      
      return publicUrlData.publicUrl;
    } catch (error) {
      logger.error(`❌ Failed to upload to Supabase:`, error);
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