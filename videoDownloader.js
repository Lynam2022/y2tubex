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

// Hàm kiểm tra danh sách định dạng để chọn định dạng khả dụng
async function getAvailableFormats(videoUrl) {
    logger.info(`Fetching formats for URL: ${videoUrl}`);
    try {
        const info = await ytdl.getInfo(videoUrl, { timeout: 30000 });
        const formats = info.formats;
        return formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel || format.audioBitrate,
            container: format.container,
            type: format.mimeType.includes('video') ? 'video' : 'audio'
        }));
    } catch (error) {
        logger.error(`Error in getAvailableFormats with @distube/ytdl-core: ${error.message}`);
        return [];
    }
}

// Hàm chọn định dạng khả dụng dựa trên chất lượng và loại nội dung
async function selectAvailableFormat(videoUrl, quality, type) {
    const formats = await getAvailableFormats(videoUrl);
    if (formats.length === 0) return null;

    const qualityMap = {
        high: ['1080p', '720p'],
        medium: ['720p', '480p'],
        low: ['360p', '240p']
    };
    const preferredQualities = qualityMap[quality] || qualityMap['high'];

    for (let q of preferredQualities) {
        const format = formats.find(f => f.quality === q && f.type.includes(type));
        if (format) return format.itag;
    }

    if (type === 'video') {
        const videoFormat = formats.find(f => f.type.includes('video'));
        if (videoFormat) return videoFormat.itag;
    }

    const audioFormat = formats.find(f => f.type.includes('audio'));
    if (audioFormat) return audioFormat.itag;

    return formats[0]?.itag || null;
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

    // Kiểm tra dữ liệu đầu vào
    if (!url || !platform || !type) {
        logger.warn(`Missing required fields (url, platform, type) from IP: ${req.ip}`);
        throw new Error('Thiếu thông tin cần thiết (url, platform, type)');
    }

    // Tạo ID duy nhất cho request
    const downloadId = uuidv4();
    const videoId = getYouTubeVideoId(url);
    
    if (!videoId) {
        throw new Error('URL không hợp lệ');
    }

    try {
        // Lấy thông tin video
        const videoInfo = await getVideoInfo(url);
        if (!videoInfo) {
            throw new Error('Không thể lấy thông tin video');
        }

        // Tạo tên file an toàn
        const safeTitle = sanitizeFileName(videoInfo.title);
        const fileExtension = type === 'audio' ? 'mp3' : 'mp4';
        const qualitySuffix = quality ? `_${quality}` : '';
        const tempFileName = `${downloadId}_${safeTitle}${qualitySuffix}.${fileExtension}`;
        const finalFileName = `${safeTitle}${qualitySuffix}.${fileExtension}`;
        
        const tempFilePath = path.join(TEMP_DIR, tempFileName);
        const finalFilePath = path.join(DOWNLOAD_DIR, finalFileName);

        // Kiểm tra xem file đã tồn tại chưa
        if (fs.existsSync(finalFilePath)) {
            logger.info(`File already exists: ${finalFilePath}`);
            return res.json({
                success: true,
                message: 'File đã tồn tại',
                filePath: `/downloads/${finalFileName}`,
                fileName: finalFileName
            });
        }

        // Tải video/audio
        const format = await selectAvailableFormat(url, quality, type);
        if (!format) {
            throw new Error('Không tìm thấy định dạng phù hợp');
        }

        // Cập nhật tiến trình
        updateDownloadProgress(downloadId, {
            status: 'downloading',
            progress: 0,
            fileName: finalFileName
        });

        // Tải file
        const stream = await downloadMediaWithYtdlCore(url, type, quality);
        const fileStream = fs.createWriteStream(tempFilePath);

        stream.pipe(fileStream);

        // Xử lý tiến trình tải
        let downloadedBytes = 0;
        const totalBytes = videoInfo.contentLength || 0;

        stream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            const progress = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
            updateDownloadProgress(downloadId, {
                status: 'downloading',
                progress: progress,
                fileName: finalFileName
            });
        });

        // Xử lý khi tải xong
        await new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });

        // Kiểm tra file tạm
        if (!fs.existsSync(tempFilePath)) {
            throw new Error('File tạm không tồn tại sau khi tải');
        }

        // Di chuyển file từ temp sang downloads
        try {
            await fsPromises.rename(tempFilePath, finalFilePath);
            logger.info(`File tải về thành công: ${finalFilePath}, kích thước: ${fs.statSync(finalFilePath).size} bytes`);
        } catch (error) {
            logger.error(`Lỗi khi di chuyển file: ${error.message}`);
            // Thử copy nếu rename thất bại
            await fsPromises.copyFile(tempFilePath, finalFilePath);
            await fsPromises.unlink(tempFilePath);
        }

        // Cập nhật tiến trình hoàn thành
        updateDownloadProgress(downloadId, {
            status: 'completed',
            progress: 100,
            fileName: finalFileName
        });

        // Trả về kết quả
        res.json({
            success: true,
            message: 'Tải xuống thành công',
            filePath: `/downloads/${finalFileName}`,
            fileName: finalFileName
        });

    } catch (error) {
        logger.error(`Lỗi khi xử lý file: ${error.message}`);
        updateDownloadProgress(downloadId, {
            status: 'error',
            error: error.message
        });
        throw error;
    }
}

module.exports = {
    handleDownload
};