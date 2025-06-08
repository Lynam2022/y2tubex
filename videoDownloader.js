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

    // Áp dụng giới hạn tốc độ
    await rateLimiter.consume('download_endpoint', 1);
    logger.info(`Download request: ${type} from ${platform}, URL: ${url}, IP: ${req.ip}`);

    // Kiểm tra FFmpeg
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
        logger.error('FFmpeg is not installed or accessible');
        throw new Error('FFmpeg không được cài đặt hoặc không thể truy cập');
    }

    // Tạo ID tải xuống và lưu vào tiến trình
    const downloadId = uuidv4();
    downloadProgressMap.set(downloadId, { progress: 0, error: null });

    if (platform === 'youtube') {
        // Kiểm tra tính hợp lệ của URL YouTube
        const videoId = getYouTubeVideoId(url);
        if (!videoId) {
            logger.warn(`Invalid YouTube URL from IP: ${req.ip}: ${url}`);
            throw new Error('URL YouTube không hợp lệ');
        }

        // Kiểm tra tính khả dụng của video
        const availability = await checkVideoAvailability(videoId);
        if (!availability.isAvailable) {
            logger.warn(`Video not available: ${videoId}, reason: ${availability.reason}`);
            throw new Error(availability.reason);
        }

        // Đảm bảo videoTitle luôn có giá trị hợp lệ
        let videoTitle = await getVideoTitle(videoId);
        if (!videoTitle || videoTitle.trim() === '') {
            videoTitle = `Video_YouTube_${videoId}`; // Fallback nếu không lấy được tiêu đề
        }

        const fileExtension = type === 'video' ? 'mp4' : 'mp3';
        const sanitizedTitle = sanitizeFileName(videoTitle);
        const fileName = `${sanitizedTitle}${quality ? `_${quality}` : ''}.${fileExtension}`;
        const filePath = path.join(DOWNLOAD_DIR, fileName);
        const tempFilePath = path.join(TEMP_DIR, `${downloadId}_${fileName}`);

        // Tạo thư mục lưu trữ nếu chưa tồn tại
        if (!await fsPromises.access(DOWNLOAD_DIR).then(() => true).catch(() => false)) {
            await fsPromises.mkdir(DOWNLOAD_DIR, { recursive: true });
        }

        // Dọn dẹp thư mục downloads
        await cleanFolder(DOWNLOAD_DIR);

        // Kiểm tra nếu file đã tồn tại
        if (await fsPromises.access(filePath).then(() => true).catch(() => false)) {
            const stats = await fsPromises.stat(filePath);
            if (stats.size === 0) {
                logger.error(`Existing file is empty: ${filePath}`);
                await fsPromises.unlink(filePath);
            } else {
                logger.info(`File đã tồn tại: ${filePath}`);
                const isValid = await validateFile(filePath, type);
                if (!isValid) {
                    logger.error(`File tồn tại nhưng không hợp lệ: ${filePath}`);
                    await fsPromises.unlink(filePath);
                } else {
                    downloadProgressMap.set(downloadId, { progress: 100, downloadUrl: `/downloads/${encodeURIComponent(fileName)}`, error: null });
                    return res.status(200).json({ success: true, downloadUrl: `/downloads/${encodeURIComponent(fileName)}` });
                }
            }
        }

        // Trả về ngay lập tức với downloadId để client theo dõi tiến trình
        res.status(200).json({ message: 'Đang tải, vui lòng chờ...', downloadId });

        // Tải file bất đồng bộ
        (async () => {
            try {
                let downloadedBytes = 0;
                let totalBytes = 0;

                // Phương pháp 1: Sử dụng yt-dlp để tải
                try {
                    const outputPath = path.join(DOWNLOAD_DIR, `${sanitizedTitle}${quality ? `_${quality}` : ''}`);
                    const options = type === 'video' ? {
                        format: 'bestvideo+bestaudio/best',
                        output: `${outputPath}.%(ext)s`,
                        mergeOutputFormat: 'mp4',
                        noCheckCertificates: true,
                        noWarnings: true,
                        preferFreeFormats: true,
                        addHeader: [
                            'referer:youtube.com',
                            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        ]
                    } : {
                        format: 'bestaudio',
                        extractAudio: true,
                        audioFormat: 'mp3',
                        output: `${outputPath}.%(ext)s`,
                        noCheckCertificates: true,
                        noWarnings: true,
                        preferFreeFormats: true,
                        addHeader: [
                            'referer:youtube.com',
                            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        ]
                    };

                    const child = ytDlp.exec(url, options, { stdio: ['pipe', 'pipe', 'pipe'] });
                    child.stdout.on('data', (data) => {
                        const progressMatch = data.toString().match(/(\d+\.\d+)%/);
                        if (progressMatch) {
                            const progress = parseFloat(progressMatch[1]);
                            downloadProgressMap.set(downloadId, { progress, error: null });
                        }
                    });

                    let errorOutput = '';
                    child.stderr.on('data', (data) => {
                        errorOutput += data.toString();
                    });

                    await new Promise((resolve, reject) => {
                        child.on('close', (code) => {
                            if (code !== 0) {
                                reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
                            } else {
                                resolve();
                            }
                        });
                    });
                } catch (error) {
                    logger.error(`yt-dlp-exec download failed: ${error.message}`);
                    // Phương pháp 2: Fallback về @distube/ytdl-core
                    try {
                        const selectedItag = await selectAvailableFormat(url, quality, type);
                        if (!selectedItag) {
                            throw new Error('Không tìm thấy định dạng khả dụng cho video/âm thanh.');
                        }

                        logger.info(`Falling back to @distube/ytdl-core to download ${type} from URL: ${url}`);

                        if (type === 'video') {
                            // Tải luồng video
                            const videoStream = ytdl(url, { quality: selectedItag });
                            const videoPath = path.join(DOWNLOAD_DIR, `${sanitizedTitle}_video.mp4`);
                            const videoFileStream = fs.createWriteStream(videoPath);
                            videoStream.pipe(videoFileStream);

                            let videoDownloadedBytes = 0;
                            videoStream.on('progress', (chunkLength, downloaded, total) => {
                                videoDownloadedBytes = downloaded;
                                const progress = Math.round((downloaded / total) * 100 * 0.5); // 50% cho video
                                downloadProgressMap.set(downloadId, { progress, error: null });
                            });

                            await new Promise((resolve, reject) => {
                                videoStream.on('end', resolve);
                                videoStream.on('error', reject);
                            });

                            if (videoDownloadedBytes === 0) {
                                throw new Error('No video data downloaded from stream.');
                            }

                            // Tải luồng âm thanh
                            const audioStream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
                            const audioPath = path.join(DOWNLOAD_DIR, `${sanitizedTitle}_audio.mp4`);
                            const audioFileStream = fs.createWriteStream(audioPath);
                            audioStream.pipe(audioFileStream);

                            let audioDownloadedBytes = 0;
                            audioStream.on('progress', (chunkLength, downloaded, total) => {
                                audioDownloadedBytes = downloaded;
                                const progress = 50 + Math.round((downloaded / total) * 100 * 0.5); // 50% cho audio
                                downloadProgressMap.set(downloadId, { progress, error: null });
                            });

                            await new Promise((resolve, reject) => {
                                audioStream.on('end', resolve);
                                audioStream.on('error', reject);
                            });

                            if (audioDownloadedBytes === 0) {
                                throw new Error('No audio data downloaded from stream.');
                            }

                            // Hợp nhất video và âm thanh bằng FFmpeg
                            let ffmpegError = '';
                            await new Promise((resolve, reject) => {
                                ffmpeg()
                                    .input(videoPath)
                                    .input(audioPath)
                                    .outputOptions('-c:v copy')
                                    .outputOptions('-c:a aac')
                                    .save(filePath)
                                    .on('end', resolve)
                                    .on('error', (err) => {
                                        ffmpegError = err.message;
                                        reject(err);
                                    });
                            });

                            if (ffmpegError) {
                                throw new Error(`FFmpeg merge failed: ${ffmpegError}`);
                            }

                            // Xóa file tạm
                            await fsPromises.unlink(videoPath);
                            await fsPromises.unlink(audioPath);
                        } else {
                            // Tải âm thanh
                            const stream = ytdl(url, { quality: selectedItag, filter: 'audioonly' });
                            const fileStream = fs.createWriteStream(filePath);
                            stream.pipe(fileStream);

                            stream.on('progress', (chunkLength, downloaded, total) => {
                                downloadedBytes = downloaded;
                                totalBytes = total;
                                const progress = Math.round((downloaded / total) * 100);
                                downloadProgressMap.set(downloadId, { progress, error: null });
                            });

                            await new Promise((resolve, reject) => {
                                stream.on('end', resolve);
                                stream.on('error', reject);
                            });

                            if (downloadedBytes === 0) {
                                throw new Error('No audio data downloaded from stream.');
                            }

                            const tempPath = filePath.replace('.mp3', '_temp.mp4');
                            await fsPromises.rename(filePath, tempPath);
                            let ffmpegError = '';
                            await new Promise((resolve, reject) => {
                                ffmpeg(tempPath)
                                    .noVideo()
                                    .audioCodec('mp3')
                                    .on('end', resolve)
                                    .on('error', (err) => {
                                        ffmpegError = err.message;
                                        reject(err);
                                    })
                                    .save(filePath);
                            });
                            if (ffmpegError) {
                                throw new Error(`FFmpeg conversion failed: ${ffmpegError}`);
                            }
                            await fsPromises.unlink(tempPath);
                        }
                    } catch (fallbackError) {
                        logger.error(`@distube/ytdl-core download failed: ${fallbackError.message}`);
                        downloadProgressMap.set(downloadId, { progress: 0, error: 'Không thể tải video/âm thanh từ bất kỳ nguồn nào.' });
                        return;
                    }
                }

                // Kiểm tra lại file trước khi trả về URL
                if (!await fsPromises.access(filePath).then(() => true).catch(() => false)) {
                    logger.error(`Download failed, file not created: ${filePath}`);
                    downloadProgressMap.set(downloadId, { progress: 0, error: 'Tải xuống thất bại. File không được tạo.' });
                    return;
                }

                const stats = await fsPromises.stat(filePath);
                if (stats.size === 0) {
                    logger.error(`File tải về rỗng: ${filePath}`);
                    await fsPromises.unlink(filePath);
                    downloadProgressMap.set(downloadId, { progress: 0, error: 'File tải về rỗng. Vui lòng thử lại.' });
                    return;
                }

                // Kiểm tra tính toàn vẹn của file
                const isValid = await validateFile(filePath, type);
                if (!isValid) {
                    logger.error(`File không hợp lệ sau khi tải: ${filePath}`);
                    await fsPromises.unlink(filePath);
                    downloadProgressMap.set(downloadId, { progress: 0, error: 'File không hợp lệ. Vui lòng thử lại.' });
                    return;
                }

                logger.info(`File tải về thành công: ${filePath}, kích thước: ${stats.size} bytes`);
                downloadProgressMap.set(downloadId, { progress: 100, downloadUrl: `/downloads/${encodeURIComponent(fileName)}`, error: null });

                // Kiểm tra sự tồn tại của file trước khi di chuyển
                try {
                    const tempFileExists = await fsPromises.access(tempFilePath)
                        .then(() => true)
                        .catch(() => false);

                    if (!tempFileExists) {
                        logger.error(`File tạm không tồn tại: ${tempFilePath}`);
                        throw new Error('File tạm không tồn tại');
                    }

                    // Sau khi tải xong, di chuyển file từ temp sang downloads
                    await fsPromises.rename(tempFilePath, filePath);
                    await fsPromises.chmod(filePath, 0o644);

                    // Dọn dẹp file tạm
                    await cleanupTempFiles();

                    // Xử lý video/audio với tối ưu bộ nhớ
                    if (type === 'video') {
                        await processVideoWithMemoryOptimization(
                            filePath,
                            filePath,
                            { audioOnly: false }
                        );
                    } else if (type === 'audio') {
                        await processVideoWithMemoryOptimization(
                            filePath,
                            filePath,
                            { audioOnly: true }
                        );
                    }
                } catch (error) {
                    logger.error(`Lỗi khi xử lý file: ${error.message}`);
                    downloadProgressMap.set(downloadId, { progress: 0, error: 'Lỗi khi xử lý file. Vui lòng thử lại.' });
                    // Xóa file tạm nếu tồn tại
                    try {
                        await fsPromises.unlink(tempFilePath).catch(() => {});
                    } catch (e) {
                        logger.error(`Không thể xóa file tạm: ${e.message}`);
                    }
                }
            } catch (error) {
                logger.error(`Download error: ${error.message}`);
                downloadProgressMap.set(downloadId, { progress: 0, error: error.message });
                throw error;
            }
        })();
    } else {
        // Xử lý các nền tảng khác ngoài YouTube (sử dụng RapidAPI)
        try {
            const response = await fetchWithRetry('https://all-media-downloader1.p.rapidapi.com/media', {
                method: 'POST',
                headers: {
                    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                    'x-rapidapi-host': 'all-media-downloader1.p.rapidapi.com',
                    'Content-Type': 'application/json'
                },
                data: { url, quality }
            });

            const data = response.data;
            if (data.error) {
                logger.warn(`RapidAPI returned error: ${data.error}`);
                return res.status(400).json({ error: data.error });
            }

            if (type === 'video' && data.video) {
                return res.status(200).json({ downloadUrl: data.video });
            } else if (type === 'audio' && data.audio) {
                return res.status(200).json({ downloadUrl: data.audio });
            } else {
                logger.warn(`RapidAPI did not return expected content for type ${type}`);
                return res.status(400).json({ error: 'Không tìm thấy nội dung để tải. API không trả về link tải.' });
            }
        } catch (rapidError) {
            logger.error(`RapidAPI Download Error: ${rapidError.message}`);
            return res.status(500).json({
                error: rapidError.message || 'Lỗi từ RapidAPI. Vui lòng kiểm tra API key hoặc thử lại sau.'
            });
        }
    }
}

module.exports = {
    handleDownload
};