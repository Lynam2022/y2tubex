// videoDownloader.js
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ytdl = require('@distube/ytdl-core');
const ytDlp = require('yt-dlp-exec');
const ffmpeg = require('fluent-ffmpeg');
const {
    logger,
    fetchWithRetry,
    checkFFmpeg,
    validateFile,
    cleanFolder,
    sanitizeFileName,
    checkVideoAvailability,
    getVideoTitle,
    getYouTubeVideoId
} = require('./utils');

// Rate Limiter: Giới hạn 50 request/phút cho endpoint tải video
const rateLimiter = new RateLimiterMemory({
    points: 50,
    duration: 60,
});

// Thêm các hàm tiện ích mới
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const TEMP_DIR = path.join(__dirname, 'temp');

// Thêm các hằng số và hàm tiện ích mới
const FFMPEG_OPTIONS = {
    threads: Math.max(1, Math.floor(require('os').cpus().length / 2)), // Sử dụng 50% số CPU cores
    preset: 'medium', // Cân bằng giữa tốc độ và chất lượng
    crf: 23, // Chất lượng video (18-28 là tốt, càng thấp càng tốt)
    audioBitrate: '128k', // Bitrate âm thanh
    audioChannels: 2, // Số kênh âm thanh
    audioCodec: 'aac', // Codec âm thanh
    videoCodec: 'libx264', // Codec video
    format: 'mp4' // Định dạng đầu ra
};

// Hàm khởi tạo thư mục và quyền truy cập
async function initializeDirectories() {
    try {
        // Tạo thư mục nếu chưa tồn tại
        await fsPromises.mkdir(DOWNLOAD_DIR, { recursive: true });
        await fsPromises.mkdir(TEMP_DIR, { recursive: true });

        // Đặt quyền truy cập cho thư mục
        await fsPromises.chmod(DOWNLOAD_DIR, 0o755);
        await fsPromises.chmod(TEMP_DIR, 0o755);

        // Đặt quyền sở hữu cho thư mục (nếu chạy với sudo)
        if (process.getuid && process.getuid() === 0) {
            const wwwDataUid = 33; // UID của user www-data trên Ubuntu
            await fsPromises.chown(DOWNLOAD_DIR, wwwDataUid, wwwDataUid);
            await fsPromises.chown(TEMP_DIR, wwwDataUid, wwwDataUid);
        }
    } catch (error) {
        logger.error(`Error initializing directories: ${error.message}`);
        throw error;
    }
}

// Hàm tạo file với quyền truy cập phù hợp
async function createFileWithPermissions(filePath) {
    try {
        const fileHandle = await fsPromises.open(filePath, 'w');
        await fileHandle.chmod(0o644);
        if (process.getuid && process.getuid() === 0) {
            const wwwDataUid = 33;
            await fileHandle.chown(wwwDataUid, wwwDataUid);
        }
        await fileHandle.close();
    } catch (error) {
        logger.error(`Error creating file with permissions: ${error.message}`);
        throw error;
    }
}

// Hàm dọn dẹp file tạm
async function cleanupTempFiles() {
    try {
        const files = await fsPromises.readdir(TEMP_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = await fsPromises.stat(filePath);
            // Xóa file tạm cũ hơn 1 giờ
            if (now - stats.mtimeMs > 3600000) {
                await fsPromises.unlink(filePath);
            }
        }
    } catch (error) {
        logger.error(`Error cleaning up temp files: ${error.message}`);
    }
}

// Khởi tạo thư mục khi module được load
initializeDirectories().catch(error => {
    logger.error(`Failed to initialize directories: ${error.message}`);
});

// Hàm lấy thông tin video
async function getVideoInfo(url) {
    try {
        const videoId = getYouTubeVideoId(url);
        if (!videoId) {
            throw new Error('URL YouTube không hợp lệ');
        }

        const info = await ytdl.getInfo(videoId, {
            timeout: 30000,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            }
        });

        if (!info) {
            throw new Error('Không thể lấy thông tin video');
        }

        // Lấy tiêu đề video
        let title = info.videoDetails?.title;
        if (!title || title.trim() === '') {
            title = `Video_YouTube_${videoId}`;
        }

        // Lấy độ dài video
        const duration = info.videoDetails?.lengthSeconds || 0;

        // Lấy kích thước nội dung
        const contentLength = info.formats?.[0]?.contentLength || 0;

        return {
            videoId,
            title,
            duration,
            contentLength,
            formats: info.formats
        };
    } catch (error) {
        logger.error(`Error getting video info: ${error.message}`, {
            url,
            error: error.stack
        });
        return null;
    }
}

// Hàm lấy ID video từ URL YouTube
function getYouTubeVideoId(url) {
    if (!url) return null;
    
    // Xử lý các định dạng URL YouTube khác nhau
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/watch\?.*&v=)([^&\n?#]+)/,
        /youtube\.com\/shorts\/([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

// Hàm chọn định dạng khả dụng
async function selectAvailableFormat(videoUrl, quality, type) {
    try {
        const info = await ytdl.getInfo(videoUrl);
        const formats = info.formats;

        if (!formats || formats.length === 0) {
            throw new Error('Không tìm thấy định dạng khả dụng');
        }

        // Lọc định dạng theo loại (video/audio)
        const filteredFormats = formats.filter(format => {
            if (type === 'video') {
                return format.hasVideo && format.hasAudio;
            } else if (type === 'audio') {
                return format.hasAudio && !format.hasVideo;
            }
            return false;
        });

        if (filteredFormats.length === 0) {
            throw new Error(`Không tìm thấy định dạng ${type} khả dụng`);
        }

        // Sắp xếp định dạng theo chất lượng
        const sortedFormats = filteredFormats.sort((a, b) => {
            if (type === 'video') {
                return (b.height || 0) - (a.height || 0);
            } else {
                return (b.audioBitrate || 0) - (a.audioBitrate || 0);
            }
        });

        // Chọn định dạng phù hợp với chất lượng yêu cầu
        let selectedFormat;
        if (quality === 'high') {
            selectedFormat = sortedFormats[0];
        } else if (quality === 'medium') {
            selectedFormat = sortedFormats[Math.floor(sortedFormats.length / 2)];
        } else {
            selectedFormat = sortedFormats[sortedFormats.length - 1];
        }

        return selectedFormat.itag;
    } catch (error) {
        logger.error(`Error selecting format: ${error.message}`, {
            url: videoUrl,
            type,
            quality,
            error: error.stack
        });
        return null;
    }
}

// Hàm tối ưu FFmpeg command
function getOptimizedFFmpegCommand() {
    return ffmpeg()
        .options(FFMPEG_OPTIONS)
        .on('error', (err) => {
            logger.error(`FFmpeg error: ${err.message}`);
        })
        .on('progress', (progress) => {
            logger.debug(`FFmpeg progress: ${JSON.stringify(progress)}`);
        });
}

// Hàm xử lý video với tối ưu bộ nhớ
async function processVideoWithMemoryOptimization(inputPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
        const command = getOptimizedFFmpegCommand()
            .input(inputPath)
            .outputOptions([
                '-movflags +faststart', // Tối ưu cho streaming
                '-max_muxing_queue_size 1024', // Tăng kích thước queue
                '-threads', FFMPEG_OPTIONS.threads,
                '-preset', FFMPEG_OPTIONS.preset,
                '-crf', FFMPEG_OPTIONS.crf
            ]);

        // Thêm các options tùy chỉnh
        if (options.audioOnly) {
            command.noVideo()
                .audioCodec(FFMPEG_OPTIONS.audioCodec)
                .audioBitrate(FFMPEG_OPTIONS.audioBitrate)
                .audioChannels(FFMPEG_OPTIONS.audioChannels);
        }

        command.save(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
}

// Hàm xử lý tải video hoặc âm thanh
async function handleDownload(req, res, downloadProgressMap) {
    const { url, platform, type, quality } = req.body;
    const downloadId = uuidv4();
    let tempFilePath = null;
    let finalFilePath = null;

    try {
        // Kiểm tra dữ liệu đầu vào
        if (!url || !platform || !type) {
            logger.warn(`Missing required fields (url, platform, type) from IP: ${req.ip}`);
            throw new Error('Thiếu thông tin cần thiết (url, platform, type)');
        }

        // Kiểm tra rate limit
        try {
            await rateLimiter.consume(req.ip);
        } catch (error) {
            logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
            throw new Error('Quá nhiều yêu cầu. Vui lòng thử lại sau!');
        }

        // Lấy thông tin video
        const videoInfo = await getVideoInfo(url);
        if (!videoInfo) {
            throw new Error('Không thể lấy thông tin video');
        }

        // Tạo tên file
        const sanitizedTitle = sanitizeFileName(videoInfo.title);
        const fileExtension = type === 'audio' ? 'mp3' : 'mp4';
        const qualitySuffix = quality ? `_${quality}` : '';
        const fileName = `${sanitizedTitle}${qualitySuffix}.${fileExtension}`;
        
        // Tạo đường dẫn file
        tempFilePath = path.join(TEMP_DIR, `${downloadId}_${fileName}`);
        finalFilePath = path.join(DOWNLOAD_DIR, fileName);

        // Khởi tạo tiến trình
        downloadProgressMap.set(downloadId, {
            progress: 0,
            status: 'starting',
            fileName: fileName
        });

        // Tải video/audio
        const format = await selectAvailableFormat(url, quality, type);
        if (!format) {
            throw new Error('Không tìm thấy định dạng phù hợp');
        }

        // Tải file
        const stream = ytdl(url, { format: format });
        const writeStream = fs.createWriteStream(tempFilePath);

        stream.pipe(writeStream);

        // Theo dõi tiến trình
        let downloadedBytes = 0;
        const totalBytes = videoInfo.contentLength;

        stream.on('progress', (chunkLength, downloaded, total) => {
            downloadedBytes = downloaded;
            const progress = Math.round((downloaded / total) * 100);
            downloadProgressMap.set(downloadId, {
                progress,
                status: 'downloading',
                fileName: fileName,
                downloaded: downloaded,
                total: total
            });
        });

        // Xử lý khi tải xong
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Kiểm tra file tạm
        if (!fs.existsSync(tempFilePath)) {
            throw new Error('File tạm không tồn tại sau khi tải');
        }

        // Di chuyển file từ temp sang downloads
        await fsPromises.rename(tempFilePath, finalFilePath);

        // Cập nhật tiến trình
        downloadProgressMap.set(downloadId, {
            progress: 100,
            status: 'completed',
            fileName: fileName,
            filePath: finalFilePath
        });

        // Trả về thông tin file
        res.json({
            success: true,
            downloadId: downloadId,
            fileName: fileName,
            filePath: `/downloads/${fileName}`
        });

    } catch (error) {
        logger.error(`Error in handleDownload: ${error.message}`, {
            error: error.stack,
            url,
            type,
            quality
        });

        // Xóa file tạm nếu có
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                await fsPromises.unlink(tempFilePath);
            } catch (unlinkError) {
                logger.error(`Error deleting temp file: ${unlinkError.message}`);
            }
        }

        // Cập nhật tiến trình lỗi
        downloadProgressMap.set(downloadId, {
            progress: 0,
            status: 'error',
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    handleDownload
};