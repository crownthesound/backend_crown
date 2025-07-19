import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Tiktok = require('@tobyg74/tiktok-api-dl');

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
   * Analyzes video URL to determine type and likelihood of success
   */
  private static analyzeVideoUrl(url: string) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname;
      const hasVideoExtension = /\.(mp4|webm|mov|avi)$/i.test(pathname);
      const isTikTokDomain = hostname.includes('tiktok');
      const isTikTokPageUrl = isTikTokDomain && pathname.includes('/video/');
      const isDirectVideoUrl = hasVideoExtension || pathname.includes('/video') || pathname.includes('mp4');
      
      return {
        hostname,
        pathname,
        hasVideoExtension,
        isTikTokDomain,
        isTikTokPageUrl,
        isDirectVideoUrl,
        urlType: isTikTokPageUrl ? 'tiktok_page' : isDirectVideoUrl ? 'direct_video' : 'unknown',
        warning: isTikTokPageUrl ? 'This appears to be a TikTok page URL, not a direct video URL' : null
      };
    } catch (error) {
      return {
        error: 'Failed to parse URL',
        warning: 'URL analysis failed - proceeding with download attempt'
      };
    }
  }

  /**
   * Extracts actual video download URL using TikTok API
   */
  private static async extractVideoUrlFromTikTokPage(pageUrl: string): Promise<string> {
    try {
      this.addLog('info', 'Starting TikTok API extraction...', { pageUrl }, 'tiktok_api_start');
      
      // Try different API versions for better compatibility
      const apiVersions = ['v1', 'v2', 'v3'];
      let result = null;
      let lastError = null;

      for (const version of apiVersions) {
        try {
          this.addLog('info', `Trying TikTok API version ${version}...`, { version, pageUrl }, 'api_version_attempt');
          
          result = await Tiktok.Downloader(pageUrl, {
            version: version
          });

          if (result && result.status === 'success') {
            this.addLog('success', `TikTok API ${version} succeeded`, { 
              version,
              resultStatus: result.status 
            }, 'api_version_success');
            break;
          } else {
            this.addLog('warn', `TikTok API ${version} failed or returned no data`, { 
              version,
              resultStatus: result?.status || 'no result' 
            }, 'api_version_failed');
          }
        } catch (versionError) {
          lastError = versionError;
          this.addLog('warn', `TikTok API ${version} threw error`, { 
            version,
            error: versionError instanceof Error ? versionError.message : String(versionError)
          }, 'api_version_error');
        }
      }

      if (!result || result.status !== 'success') {
        throw new Error(`All TikTok API versions failed. Last error: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`);
      }

      this.addLog('info', 'TikTok API response received', {
        status: result.status,
        hasResult: !!result.result,
        resultKeys: result.result ? Object.keys(result.result) : []
      }, 'api_response_received');

      // Extract video URLs from the API response
      const videoUrls = this.extractVideoUrlsFromApiResponse(result);
      
      if (videoUrls.length === 0) {
        throw new Error('No video download URLs found in TikTok API response');
      }

      // Select the best quality video URL
      const selectedUrl = this.selectBestVideoUrl(videoUrls);
      
      this.addLog('success', 'Video URL extracted via TikTok API', {
        totalUrlsFound: videoUrls.length,
        selectedUrl,
        allUrls: videoUrls
      }, 'video_url_extracted');

      return selectedUrl;

    } catch (error) {
      this.addLog('error', 'Failed to extract video URL via TikTok API', {
        error: error instanceof Error ? error.message : String(error),
        pageUrl
      }, 'video_extraction_error');
      throw new Error(`TikTok API extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extracts video URLs from TikTok API response
   */
  private static extractVideoUrlsFromApiResponse(apiResult: any): string[] {
    const videoUrls: string[] = [];
    
    this.addLog('info', 'Extracting video URLs from TikTok API response...', {
      hasResult: !!apiResult.result,
      resultType: typeof apiResult.result
    }, 'api_extraction_start');

    try {
      const result = apiResult.result;
      
      if (!result) {
        throw new Error('No result data in API response');
      }

      // Log the structure for debugging
      this.addLog('info', 'API result structure analysis', {
        resultKeys: Object.keys(result),
        hasVideo: !!result.video,
        hasVideos: !!result.videos,
        hasDownload: !!result.download,
        hasHdDownload: !!result.hdDownload
      }, 'api_structure_analysis');

      // Method 1: Check for direct video URL fields
      const videoFields = ['video', 'hdVideo', 'download', 'hdDownload', 'videoUrl', 'playAddr'];
      
      for (const field of videoFields) {
        if (result[field] && typeof result[field] === 'string') {
          videoUrls.push(result[field]);
          this.addLog('info', `Found video URL in field: ${field}`, { url: result[field] }, 'url_found');
        }
      }

      // Method 2: Check for nested video objects
      if (result.video && typeof result.video === 'object') {
        const videoObj = result.video;
        const nestedFields = ['playAddr', 'downloadAddr', 'url', 'play_addr', 'download_addr'];
        
        for (const field of nestedFields) {
          if (videoObj[field] && typeof videoObj[field] === 'string') {
            videoUrls.push(videoObj[field]);
            this.addLog('info', `Found video URL in nested field: video.${field}`, { url: videoObj[field] }, 'nested_url_found');
          }
        }
      }

      // Method 3: Check for video arrays with different qualities
      if (result.videos && Array.isArray(result.videos)) {
        result.videos.forEach((video: any, index: number) => {
          if (video && typeof video === 'string') {
            videoUrls.push(video);
            this.addLog('info', `Found video URL in videos array[${index}]`, { url: video }, 'array_url_found');
          } else if (video && typeof video === 'object' && video.url) {
            videoUrls.push(video.url);
            this.addLog('info', `Found video URL in videos array[${index}].url`, { url: video.url, quality: video.quality }, 'array_object_url_found');
          }
        });
      }

      // Remove duplicates and validate URLs
      const uniqueUrls = [...new Set(videoUrls)].filter(url => {
        try {
          new URL(url);
          return url.includes('http') && (url.includes('.mp4') || url.includes('video') || url.includes('tiktok'));
        } catch {
          return false;
        }
      });

      this.addLog('success', 'Video URL extraction completed', {
        totalFound: videoUrls.length,
        uniqueValid: uniqueUrls.length,
        urls: uniqueUrls
      }, 'api_extraction_complete');

      return uniqueUrls;

    } catch (error) {
      this.addLog('error', 'Error extracting URLs from API response', {
        error: error instanceof Error ? error.message : String(error),
        resultStructure: apiResult.result ? Object.keys(apiResult.result) : 'no result'
      }, 'api_extraction_error');
      return [];
    }
  }

  /**
   * Selects the best quality video URL from available options
   */
  private static selectBestVideoUrl(videoUrls: string[]): string {
    if (videoUrls.length === 0) {
      throw new Error('No video URLs provided for selection');
    }

    if (videoUrls.length === 1) {
      this.addLog('info', 'Only one video URL available, selecting it', { selectedUrl: videoUrls[0] }, 'url_selection');
      return videoUrls[0];
    }

    // Prefer URLs with quality indicators (HD, high quality, etc.)
    const hdUrls = videoUrls.filter(url => 
      url.includes('hd') || url.includes('high') || url.includes('720') || url.includes('1080')
    );

    if (hdUrls.length > 0) {
      this.addLog('info', 'Selected HD quality URL', { 
        selectedUrl: hdUrls[0],
        hdOptions: hdUrls.length,
        totalOptions: videoUrls.length
      }, 'hd_url_selected');
      return hdUrls[0];
    }

    // If no HD URLs, prefer URLs without 'watermark' in them
    const noWatermarkUrls = videoUrls.filter(url => !url.includes('watermark'));
    
    if (noWatermarkUrls.length > 0) {
      this.addLog('info', 'Selected non-watermark URL', { 
        selectedUrl: noWatermarkUrls[0],
        noWatermarkOptions: noWatermarkUrls.length,
        totalOptions: videoUrls.length
      }, 'no_watermark_selected');
      return noWatermarkUrls[0];
    }

    // Default to first URL
    this.addLog('info', 'Selected first available URL', { 
      selectedUrl: videoUrls[0],
      totalOptions: videoUrls.length
    }, 'default_url_selected');
    
    return videoUrls[0];
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
      
      // Generate unique filename with proper path (no leading slash)
      fileName = `videos/${userId}_${videoId}_${Date.now()}_${uuidv4()}.mp4`;
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
      
      this.addLog('success', 'Video download and storage completed successfully!', {
        publicUrl,
        fileName,
        videoId,
        userId
      }, 'completion');
      
      const result: VideoDownloadResult = {
        publicUrl,
        fileName,
        logs: this.getLogs() // Get logs after the completion log
      };
      
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
      this.addLog('info', `Downloading video stream from: ${videoUrl}`, { videoUrl }, 'stream_start');
      
      // Validate URL format
      if (!videoUrl || typeof videoUrl !== 'string') {
        throw new Error('Invalid video URL provided');
      }
      
      // Analyze URL to determine if it's likely a direct video URL or TikTok page URL
      const urlAnalysis = this.analyzeVideoUrl(videoUrl);
      this.addLog('info', 'URL Analysis completed', urlAnalysis, 'url_analysis');
      
      let actualVideoUrl = videoUrl;
      
      // If this is a TikTok page URL, we need to extract the actual video URL
      if (urlAnalysis.isTikTokPageUrl) {
        this.addLog('info', 'TikTok page URL detected - extracting actual video URL...', {}, 'video_extraction_start');
        actualVideoUrl = await this.extractVideoUrlFromTikTokPage(videoUrl);
        this.addLog('success', 'Video URL extracted successfully', { 
          originalUrl: videoUrl,
          extractedUrl: actualVideoUrl 
        }, 'video_extraction_complete');
      }
      
      this.addLog('info', 'Making HTTP request to video URL...', { 
        actualVideoUrl,
        timeout: this.TIMEOUT,
        maxFileSize: `${(this.MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)}MB`
      }, 'http_request');
      
      // Make HTTP request to download actual video
      const response = await axios({
        method: 'GET',
        url: actualVideoUrl,
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
      
      // Log response details
      const contentType = response.headers['content-type'];
      const contentLength = response.headers['content-length'];
      const statusCode = response.status;
      const finalUrl = response.config.url;
      
      this.addLog('info', 'HTTP response received', {
        statusCode,
        contentType,
        contentLength: contentLength ? `${contentLength} bytes` : 'unknown',
        finalUrl,
        redirected: finalUrl !== actualVideoUrl,
        isActualVideo: contentType?.includes('video/') || contentType?.includes('application/octet-stream')
      }, 'http_response');
      
      // Check content type
      if (contentType && !contentType.includes('video/') && !contentType.includes('application/octet-stream')) {
        this.addLog('warn', `Unexpected content type: ${contentType}`, { 
          contentType,
          expectedTypes: ['video/', 'application/octet-stream'],
          warning: 'This might still be a page URL, not a direct video URL'
        }, 'content_type_warning');
      } else {
        this.addLog('success', 'Correct video content type detected', { 
          contentType 
        }, 'content_type_success');
      }
      
      // Get content length for validation
      if (contentLength) {
        const sizeInBytes = parseInt(contentLength);
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
        
        this.addLog('info', `Expected video size: ${sizeInMB}MB (${sizeInBytes} bytes)`, {
          sizeInBytes,
          sizeInMB,
          maxAllowed: this.MAX_FILE_SIZE
        }, 'size_check');
        
        if (sizeInBytes > this.MAX_FILE_SIZE) {
          throw new Error(`Video file too large: ${sizeInMB}MB (max: ${(this.MAX_FILE_SIZE / (1024 * 1024)).toFixed(2)}MB)`);
        }
      } else {
        this.addLog('warn', 'No Content-Length header found - cannot verify expected file size', {}, 'size_warning');
      }
      
      this.addLog('success', 'Video stream download started successfully', {
        streamAvailable: !!response.data,
        contentType,
        contentLength: contentLength || 'unknown'
      }, 'stream_ready');
      
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
      
      // Check for double slashes in the URL
      const hasDoubleSlash = publicUrlData.publicUrl.includes('//') && !publicUrlData.publicUrl.includes('https://');
      if (hasDoubleSlash) {
        logger.warn(`⚠️ Double slash detected in public URL, this may cause issues`);
      }
      
      logger.info(`✅ Video uploaded successfully to Supabase storage!`, {
        fileName,
        publicUrl: publicUrlData.publicUrl,
        fileSize: sizeInMB + 'MB',
        bucketPath: data.path,
        hasDoubleSlash
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
   * Converts stream to buffer with size limit and detailed progress tracking
   */
  private static async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let chunkCount = 0;
      const startTime = Date.now();
      
      this.addLog('info', 'Starting stream to buffer conversion...', {
        maxFileSize: this.MAX_FILE_SIZE,
        timeout: this.TIMEOUT
      }, 'buffer_start');
      
      stream.on('data', (chunk: Buffer) => {
        chunkCount++;
        totalSize += chunk.length;
        
        // Log progress every 50 chunks or every MB
        if (chunkCount % 50 === 0 || totalSize % (1024 * 1024) < chunk.length) {
          const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
          this.addLog('info', `Download progress: ${sizeInMB}MB received`, {
            totalBytes: totalSize,
            totalMB: sizeInMB,
            chunksReceived: chunkCount,
            lastChunkSize: chunk.length
          }, 'download_progress');
        }
        
        if (totalSize > this.MAX_FILE_SIZE) {
          stream.destroy();
          this.addLog('error', 'Video file too large, aborting download', {
            totalSize,
            maxSize: this.MAX_FILE_SIZE,
            totalMB: (totalSize / (1024 * 1024)).toFixed(2)
          }, 'size_limit_exceeded');
          reject(new Error(`Video file too large: ${totalSize} bytes (max: ${this.MAX_FILE_SIZE})`));
          return;
        }
        
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        const finalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
        
        this.addLog('success', `Stream download completed successfully`, {
          totalBytes: totalSize,
          totalMB: finalSizeInMB,
          chunksReceived: chunkCount,
          durationMs: duration,
          averageSpeed: totalSize > 0 ? `${((totalSize / 1024) / (duration / 1000)).toFixed(2)} KB/s` : '0 KB/s'
        }, 'buffer_complete');
        
        const finalBuffer = Buffer.concat(chunks);
        
        // Verify buffer size matches expected
        if (finalBuffer.length !== totalSize) {
          this.addLog('warn', 'Buffer size mismatch detected', {
            expectedSize: totalSize,
            actualBufferSize: finalBuffer.length,
            difference: finalBuffer.length - totalSize
          }, 'buffer_size_mismatch');
        }
        
        resolve(finalBuffer);
      });
      
      stream.on('error', (error) => {
        const errorTime = Date.now();
        const duration = errorTime - startTime;
        
        this.addLog('error', 'Stream error occurred during download', {
          error: error.message,
          totalBytesBeforeError: totalSize,
          chunksBeforeError: chunkCount,
          durationBeforeError: duration
        }, 'stream_error');
        
        reject(error);
      });
      
      // Set timeout
      const timeout = setTimeout(() => {
        const timeoutTime = Date.now();
        const duration = timeoutTime - startTime;
        
        this.addLog('error', 'Video download timeout - stream taking too long', {
          timeoutAfter: this.TIMEOUT,
          totalBytesBeforeTimeout: totalSize,
          chunksBeforeTimeout: chunkCount,
          durationMs: duration,
          estimatedTotalSize: 'unknown'
        }, 'download_timeout');
        
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