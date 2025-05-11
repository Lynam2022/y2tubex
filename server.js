require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const ytdl = require('ytdl-core');
const ytdlp = require('yt-dlp-exec');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ error: `Invalid JSON: ${e.message}` });
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express.static('public'));

// Middleware xử lý CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// Rate Limiter: Giới hạn 50 request/phút
const rateLimiter = new RateLimiterMemory({
    points: 50,
    duration: 60,
});

// Rate Limiter cho tải phụ đề: Giới hạn 5 request/giây
const subtitleRateLimiter = new RateLimiterMemory({
    points: 5,
    duration: 1,
});

// Cấu hình OAuth2
const oauth2Client = new google.auth.OAuth2(
    '1075063687158-jo5j1dasp9ct37ee2rbd7a99q742m60r.apps.googleusercontent.com',
    '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',
    'http://localhost:3000/oauth2callback'
);

// Đường dẫn lưu token
const TOKEN_PATH = path.join(__dirname, 'tokens.json');

// Hàm lưu token
function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Tokens saved to', TOKEN_PATH);
}

// Hàm tải token
function loadTokens() {
    if (fs.existsSync(TOKEN_PATH)) {
        return JSON.parse(fs.readFileSync(TOKEN_PATH));
    }
    return null;
}

// Khởi tạo và làm mới token
function initializeAndRefreshToken() {
    const savedTokens = loadTokens();
    if (savedTokens && savedTokens.access_token) {
        oauth2Client.setCredentials(savedTokens);
        console.log('Loaded access token from tokens.json');
        if (savedTokens.expiry_date < Date.now() + 60000) {
            oauth2Client.refreshAccessToken((err, tokens) => {
                if (!err && tokens) {
                    oauth2Client.setCredentials(tokens);
                    saveTokens(tokens);
                    console.log('Token refreshed successfully');
                } else {
                    console.error('Token refresh failed:', err?.message);
                }
            });
        }
    } else {
        console.log('No valid token found in tokens.json');
    }
}

initializeAndRefreshToken();

// Endpoint để tạo URL xác thực
app.get('/auth', (req, res) => {
    try {
        const scopes = ['https://www.googleapis.com/auth/youtube.force-ssl'];
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
        });
        console.log('Generated OAuth2 URL:', url);
        res.redirect(url);
    } catch (error) {
        console.error('Error generating OAuth2 URL:', error.message);
        res.status(500).send('Lỗi khi tạo URL xác thực OAuth2');
    }
});

// Endpoint xử lý callback OAuth2
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        console.error('OAuth2 Callback Error:', error);
        return res.status(400).send(`Lỗi xác thực: ${error}`);
    }

    if (!code) {
        return res.status(400).send('Mã xác thực không hợp lệ');
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        saveTokens(tokens);
        res.send('Xác thực thành công! Bạn có thể đóng cửa sổ này và thử lại yêu cầu tải phụ đề.');
    } catch (error) {
        console.error('Error retrieving access token:', error);
        res.status(500).send('Lỗi xác thực OAuth2');
    }
});

// Endpoint metadata
app.post('/api/metadata', async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'Body yêu cầu không hợp lệ hoặc thiếu dữ liệu. Vui lòng gửi JSON với các trường url và platform.' });
    }

    const { url, platform } = req.body;

    if (!url || !platform) {
        return res.status(400).json({ error: 'Thiếu thông tin cần thiết (url, platform)' });
    }

    try {
        let metadata = { thumbnail: '', title: '' };

        if (platform === 'youtube') {
            const videoId = url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?&]+)/)?.[1];
            if (videoId) {
                const youtubeResponse = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                    params: {
                        part: 'snippet',
                        id: videoId,
                        key: process.env.YOUTUBE_API_KEY
                    }
                });
                const item = youtubeResponse.data.items[0];
                if (item) {
                    metadata.thumbnail = item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url;
                    metadata.title = item.snippet.title || `Video YouTube mẫu - ${videoId}`;
                } else {
                    metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    metadata.title = `Video YouTube mẫu - ${videoId}`;
                }
            } else {
                metadata.thumbnail = '';
                metadata.title = 'Video YouTube mẫu';
            }
        } else {
            try {
                const rapidApiResponse = await axios.post('https://all-media-downloader1.p.rapidapi.com/media', { url }, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'all-media-downloader1.p.rapidapi.com',
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                });
                const data = rapidApiResponse.data;
                if (data && data.metadata) {
                    metadata.thumbnail = data.metadata.thumbnail || '';
                    metadata.title = data.metadata.title || (platform === 'tiktok' || platform === 'douyin' ? 'Video TikTok/Douyin mẫu' :
                        platform === 'facebook' ? 'Video Facebook mẫu' :
                        platform === 'instagram' ? 'Bài đăng Instagram mẫu' :
                        platform === 'twitter' ? 'Tweet mẫu' : 'Mẫu tiêu đề video');
                } else {
                    throw new Error('Metadata không hợp lệ từ RapidAPI');
                }
            } catch (rapidError) {
                console.error('RapidAPI Metadata Error:', rapidError.response ? rapidError.response.data : rapidError.message);
                metadata.title = platform === 'tiktok' || platform === 'douyin' ? 'Video TikTok/Douyin mẫu' :
                    platform === 'facebook' ? 'Video Facebook mẫu' :
                    platform === 'instagram' ? 'Bài đăng Instagram mẫu' :
                    platform === 'twitter' ? 'Tweet mẫu' : 'Mẫu tiêu đề video';
            }
        }

        res.json(metadata);
    } catch (error) {
        console.error('Metadata Error:', error.response ? error.response.data : error.message);
        const fallbackTitle = platform === 'youtube' ? 'Video YouTube mẫu' :
            platform === 'tiktok' || platform === 'douyin' ? 'Video TikTok/Douyin mẫu' :
            platform === 'facebook' ? 'Video Facebook mẫu' :
            platform === 'instagram' ? 'Bài đăng Instagram mẫu' :
            platform === 'twitter' ? 'Tweet mẫu' : 'Mẫu tiêu đề video';
        res.status(500).json({ thumbnail: '', title: fallbackTitle });
    }
});

// Endpoint tải video hoặc âm thanh
app.post('/api/download', async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'Body yêu cầu không hợp lệ hoặc thiếu dữ liệu. Vui lòng gửi JSON với các trường url, platform, type.' });
    }

    const { url, platform, type, quality } = req.body;

    if (!url || !platform || !type) {
        return res.status(400).json({ error: 'Thiếu thông tin cần thiết (url, platform, type)' });
    }

    try {
        await rateLimiter.consume('download_endpoint', 1);

        if (platform === 'youtube') {
            const videoId = url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?&]+)/)?.[1];
            if (!videoId) {
                return res.status(400).json({ error: 'URL YouTube không hợp lệ' });
            }

            let videoTitle;
            try {
                const youtubeResponse = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
                    params: {
                        part: 'snippet',
                        id: videoId,
                        key: process.env.YOUTUBE_API_KEY
                    }
                });
                const item = youtubeResponse.data.items[0];
                if (item) {
                    videoTitle = item.snippet.title.replace(/[^a-zA-Z0-9]/g, '_');
                } else {
                    videoTitle = `Video_YouTube_${videoId}`;
                }
            } catch (error) {
                console.error('Error fetching video title:', error.message);
                videoTitle = `Video_YouTube_${videoId}`;
            }

            const qualityMap = { high: 'bestvideo+bestaudio/best', medium: 'medium', low: 'worst' };
            const selectedQuality = qualityMap[quality] || 'bestvideo+bestaudio/best';
            const fileExtension = type === 'video' ? 'mp4' : 'mp3';
            const fileName = `${videoTitle}_${videoId}_${quality}.${fileExtension}`;
            const filePath = path.join(__dirname, 'downloads', fileName);

            if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
                fs.mkdirSync(path.join(__dirname, 'downloads'));
            }

            if (fs.existsSync(filePath)) {
                return res.json({ success: true, downloadUrl: `/downloads/${fileName}` });
            }

            try {
                if (type === 'video') {
                    await ytdlp(url, {
                        output: filePath,
                        format: selectedQuality,
                        mergeOutputFormat: 'mp4'
                    });
                } else {
                    await ytdlp(url, {
                        output: filePath,
                        format: 'bestaudio/best',
                        extractAudio: true,
                        audioFormat: 'mp3'
                    });
                }
                res.json({ success: true, downloadUrl: `/downloads/${fileName}` });
            } catch (error) {
                console.error('yt-dlp Error:', error);
                res.status(500).json({ error: 'Không thể tải nội dung từ YouTube. Vui lòng thử lại sau!' });
            }
        } else {
            try {
                const response = await axios.post('https://all-media-downloader1.p.rapidapi.com/media', { url, quality }, {
                    headers: {
                        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                        'x-rapidapi-host': 'all-media-downloader1.p.rapidapi.com',
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                });

                const data = response.data;
                if (data.error) {
                    return res.status(400).json({ error: data.error });
                }

                if (type === 'video' && data.video) {
                    return res.json({ downloadUrl: data.video });
                } else if (type === 'audio' && data.audio) {
                    return res.json({ downloadUrl: data.audio });
                } else {
                    return res.status(400).json({ error: 'Không tìm thấy nội dung để tải' });
                }
            } catch (rapidError) {
                console.error('RapidAPI Download Error:', rapidError.response ? rapidError.response.data : rapidError.message);
                return res.status(rapidError.response?.status || 500).json({ error: 'Lỗi từ API tải nội dung khác' });
            }
        }
    } catch (error) {
        console.error('API Error:', error.response ? error.response.data : error.message);
        if (error.response) {
            if (error.response.status === 429) {
                return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau!' });
            }
            return res.status(error.response.status).json({ error: error.response.data?.message || 'Lỗi từ API tải nội dung' });
        } else if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Yêu cầu tải nội dung hết thời gian. Vui lòng thử lại!' });
        } else if (error.code === 'RATE_LIMITER_POINTS_EXCEEDED') {
            return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau!' });
        } else {
            return res.status(500).json({ error: error.message || 'Lỗi server khi tải nội dung. Vui lòng thử lại sau!' });
        }
    }
});

// Endpoint tải phụ đề
app.post('/api/download-subtitle', async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'Body yêu cầu không hợp lệ hoặc thiếu dữ liệu. Vui lòng gửi JSON với các trường url, platform, targetLanguage (mặc định "en"), và formatPreference (mặc định "srt").' });
    }

    const { url, platform, targetLanguage = 'en', formatPreference = 'srt' } = req.body;

    if (!url || !platform) {
        return res.status(400).json({ error: 'Thiếu thông tin cần thiết (url, platform)' });
    }

    try {
        await subtitleRateLimiter.consume(`download_subtitle_${req.ip}`, 1);

        const subtitlesDir = path.join(__dirname, 'subtitles');
        if (!fs.existsSync(subtitlesDir)) {
            fs.mkdirSync(subtitlesDir);
        }

        let subtitleUrl = '';
        let selectedLanguage = targetLanguage;

        if (platform === 'youtube') {
            const videoId = url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?&]+)/)?.[1];
            if (!videoId) {
                return res.status(400).json({ error: 'URL YouTube không hợp lệ' });
            }

            let subtitleContent = null;
            try {
                if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
                    throw new Error('Chưa có token hợp lệ. Vui lòng truy cập: http://localhost:3000/auth để cấp quyền.');
                }

                const youtube = google.youtube({
                    version: 'v3',
                    auth: oauth2Client
                });

                const captionsResponse = await youtube.captions.list({
                    part: 'snippet',
                    videoId: videoId
                });

                if (!captionsResponse.data.items || captionsResponse.data.items.length === 0) {
                    throw new Error('Video không có phụ đề nào');
                }

                const availableLanguages = captionsResponse.data.items.map(item => item.snippet.language);
                selectedLanguage = availableLanguages.includes(targetLanguage) ? targetLanguage : availableLanguages[0];

                const captionId = captionsResponse.data.items.find(item => item.snippet.language === selectedLanguage)?.id;
                if (!captionId) {
                    throw new Error(`Không tìm thấy phụ đề cho ngôn ngữ ${selectedLanguage}`);
                }

                const supportedFormats = ['srt', 'txt', 'vtt'];
                let format = supportedFormats.includes(formatPreference.toLowerCase()) ? formatPreference.toLowerCase() : 'srt';

                const captionResponse = await youtube.captions.download({
                    id: captionId,
                    tfmt: format === 'txt' ? 'vtt' : format
                });

                subtitleContent = captionResponse.data;
            } catch (apiError) {
                console.error('YouTube Data API Error:', apiError.response ? apiError.response.data : apiError.message);

                try {
                    const info = await ytdl.getInfo(url);
                    const captions = info.player_response.captions;
                    if (!captions || !captions.playerCaptionsTracklistRenderer) {
                        throw new Error('Video không có phụ đề nào');
                    }

                    const captionTracks = captions.playerCaptionsTracklistRenderer.captionTracks;
                    const caption = captionTracks.find(track => track.languageCode === targetLanguage);
                    if (!caption) {
                        throw new Error(`Không tìm thấy phụ đề cho ngôn ngữ ${targetLanguage}`);
                    }

                    const captionUrl = caption.baseUrl;
                    const response = await axios.get(captionUrl, { responseType: 'text' });
                    subtitleContent = response.data;
                } catch (ytdlError) {
                    console.error('ytdl-core Fallback Error:', ytdlError.message);
                    if (ytdlError.message.includes('Could not extract functions')) {
                        throw new Error('Không thể tải phụ đề do lỗi phân tích cú pháp từ YouTube. Vui lòng thử video khác.');
                    }
                    throw apiError;
                }
            }

            let format = formatPreference.toLowerCase();
            if (format === 'txt') {
                subtitleContent = subtitleContent.replace(/WEBVTT\n\n|^\d+\n\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\n/g, '').trim();
            } else if (format === 'srt') {
                subtitleContent = convertVttToSrt(subtitleContent);
            }

            const fileName = `subtitle_${videoId}_${selectedLanguage}.${format}`;
            const filePath = path.join(subtitlesDir, fileName);
            fs.writeFileSync(filePath, subtitleContent);

            subtitleUrl = `/subtitles/${fileName}`;
        } else {
            const response = await axios.post('https://all-media-downloader1.p.rapidapi.com/media', {
                url,
                language: targetLanguage,
                format: formatPreference
            }, {
                headers: {
                    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                    'x-rapidapi-host': 'all-media-downloader1.p.rapidapi.com',
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });

            const data = response.data;
            if (data.error || !data.subtitle) {
                return res.status(404).json({ error: data.error || 'RapidAPI không hỗ trợ trích xuất phụ đề cho nền tảng này' });
            }

            const fileName = `subtitle_${targetLanguage || 'en'}_${uuidv4()}.${formatPreference}`;
            const filePath = path.join(subtitlesDir, fileName);
            fs.writeFileSync(filePath, data.subtitle);

            subtitleUrl = `/subtitles/${fileName}`;
        }

        res.json({ success: true, downloadUrl: subtitleUrl, selectedLanguage });
    } catch (error) {
        console.error('Subtitle Download Error:', error.response ? error.response.data : error.message);
        if (error.code === 'RATE_LIMITER_POINTS_EXCEEDED') {
            return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau vài giây!' });
        }
        if (error.response) {
            if (error.response.status === 429) {
                return res.status(429).json({ error: 'Quá nhiều yêu cầu từ API YouTube. Vui lòng thử lại sau!' });
            }
            if (error.response.status === 403) {
                const errorMessage = error.response.data?.error?.message || 'Không đủ quyền tải phụ đề';
                if (errorMessage.includes('third-party contributions')) {
                    return res.status(403).json({ error: 'Video không cho phép tải phụ đề do hạn chế từ chủ sở hữu. Vui lòng thử video khác.' });
                }
                return res.status(403).json({ error: `Lỗi quyền truy cập: ${errorMessage}. Vui lòng làm mới token qua http://localhost:3000/auth.` });
            }
            return res.status(error.response.status).json({ error: error.response.data?.error?.message || error.message || 'Lỗi từ API tải phụ đề' });
        } else if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Yêu cầu tải phụ đề hết thời gian. Vui lòng thử lại!' });
        } else {
            return res.status(500).json({ error: error.message || 'Lỗi server khi tải phụ đề. Vui lòng thử lại sau!' });
        }
    }
});

// Hàm chuyển đổi VTT sang SRT
function convertVttToSrt(vttText) {
    let srtText = vttText
        .replace(/WEBVTT\n\n/, '')
        .replace(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g, (match, start, end, index) => {
            return `${index + 1}\n${start.replace('.', ',')} --> ${end.replace('.', ',')}`;
        });
    return srtText;
}

// Endpoint tải phụ đề (GET) - Thông báo lỗi
app.get('/api/download-subtitle', (req, res) => {
    res.status(405).json({ error: 'Phương thức không được hỗ trợ. Vui lòng sử dụng POST để gửi yêu cầu tới /api/download-subtitle với body chứa url, platform, targetLanguage (mặc định "en"), và formatPreference (mặc định "srt").' });
});

// Cung cấp file phụ đề
app.get('/subtitles/:file', (req, res) => {
    const filePath = path.join(__dirname, 'subtitles', req.params.file);
    if (fs.existsSync(filePath)) {
        res.download(filePath, req.params.file);
    } else {
        res.status(404).json({ error: 'File phụ đề không tìm thấy' });
    }
});

// Cung cấp file tải về (video/âm thanh)
app.get('/downloads/:file', (req, res) => {
    const filePath = path.join(__dirname, 'downloads', req.params.file);
    if (fs.existsSync(filePath)) {
        res.download(filePath, req.params.file);
    } else {
        res.status(404).json({ error: 'File tải về không tìm thấy' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});