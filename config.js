const path = require('path');

// Thư mục lưu trữ
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const SUBTITLE_DIR = path.join(__dirname, 'subtitles');
const THUMBNAIL_DIR = path.join(__dirname, 'thumbnails');

// Cấu hình server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Cấu hình rate limiting
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 phút
const RATE_LIMIT_MAX = 100; // Số request tối đa trong 15 phút

// Cấu hình subtitle
const SUBTITLE_RETRY_DELAY = 1000; // 1 giây
const SUBTITLE_MAX_RETRIES = 3;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

// Cấu hình video
const VIDEO_QUALITY = {
    high: 'best',
    medium: 'medium',
    low: 'worst'
};

// Cấu hình logging
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = path.join(__dirname, 'logs');

module.exports = {
    DOWNLOAD_DIR,
    SUBTITLE_DIR,
    THUMBNAIL_DIR,
    PORT,
    HOST,
    RATE_LIMIT_WINDOW,
    RATE_LIMIT_MAX,
    SUBTITLE_RETRY_DELAY,
    SUBTITLE_MAX_RETRIES,
    CHUNK_SIZE,
    VIDEO_QUALITY,
    LOG_LEVEL,
    LOG_DIR
}; 