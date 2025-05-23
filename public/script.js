document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const fetchBtn = document.getElementById('fetchBtn');
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    const downloadAudioBtn = document.getElementById('downloadAudioBtn');
    const copyTitleBtn = document.getElementById('copyTitleBtn');
    const resultDiv = document.getElementById('result');
    const platformIcon = document.getElementById('platformIcon');
    const contentPreview = document.getElementById('contentPreview');
    const thumbnail = document.getElementById('thumbnail');
    const title = document.getElementById('title');
    const downloadThumbnailBtn = document.getElementById('downloadThumbnailBtn');
    const thumbnailResolutions = document.getElementById('thumbnailResolutions');
    const thumbnailList = document.querySelector('.thumbnail-list');
    const downloadSubtitleBtn = document.getElementById('downloadSubtitleBtn');
    const subtitleLanguage = document.getElementById('subtitleLanguage');
    const subtitleFormat = document.getElementById('subtitleFormat');

    let selectedThumbnail = null;
    let currentVideoId = null;

    // Hàm chuẩn hóa tên file
    function sanitizeFileName(filename) {
        return filename
            .replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_') // Loại bỏ ký tự không hợp lệ
            .replace(/\s+/g, '_') // Thay khoảng trắng bằng dấu gạch dưới
            .replace(/\.+/g, '.') // Loại bỏ nhiều dấu chấm liên tiếp
            .replace(/^\.+|\.+$/g, '') // Loại bỏ dấu chấm ở đầu và cuối
            .substring(0, 50) // Giới hạn độ dài tên file
            .trim();
    }

    function normalizeUrl(url) {
        if (!url) return '';
        url = url.trim();
        if (!url.match(/^https?:\/\//)) {
            url = 'https://' + url;
        }
        return url;
    }

    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    function detectPlatform(url) {
        if (!url || !isValidUrl(url)) return null;
        url = url.toLowerCase();
        const patterns = {
            tiktok: [/tiktok\.com/i, /tiktok\.com\/t\//i, /vt\.tiktok\.com/i],
            instagram: [/instagram\.com/i, /instagr\.am/i],
            youtube: [/youtube\.com/i, /youtu\.be/i, /youtube-nocookie\.com/i],
            twitter: [/twitter\.com/i, /x\.com/i],
            facebook: [/facebook\.com/i, /fb\.com/i, /fb\.watch/i],
            douyin: [/douyin\.com/i]
        };
        for (const [platform, regexes] of Object.entries(patterns)) {
            if (regexes.some(regex => regex.test(url))) {
                return platform;
            }
        }
        return null;
    }

    function updatePlatformIcon(platform) {
        platformIcon.classList.remove('active', 'fa-tiktok', 'fa-instagram', 'fa-youtube', 'fa-twitter', 'fa-facebook', 'fa-douyin');
        if (platform) {
            const iconClass = platform === 'douyin' ? 'fa-douyin' : `fa-${platform}`;
            platformIcon.classList.add('active', iconClass);
        }
    }

    async function fetchMetadata(url, platform) {
        try {
            const response = await fetch('/api/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, platform })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Không thể lấy dữ liệu');
            }
            if (!data.title) {
                data.title = platform === 'youtube' ? 'Video YouTube mẫu' : 'Mẫu tiêu đề video';
            }
            return data;
        } catch (error) {
            console.error('Metadata Error:', error);
            throw error;
        }
    }

    function getYouTubeVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    function displayThumbnailResolutions(videoId) {
        const resolutions = [
            { name: 'HD (1280x720)', url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` },
            { name: 'SD (640x480)', url: `https://img.youtube.com/vi/${videoId}/sddefault.jpg` },
            { name: 'Medium (480x360)', url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` },
            { name: 'Small (320x180)', url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` },
            { name: 'Tiny (120x90)', url: `https://img.youtube.com/vi/${videoId}/default.jpg` }
        ];

        thumbnailList.innerHTML = '';
        resolutions.forEach(res => {
            const item = document.createElement('div');
            item.className = 'thumbnail-item';
            const img = document.createElement('img');
            img.src = res.url;
            img.alt = res.name;
            img.onerror = () => { img.src = 'https://via.placeholder.com/120x90?text=Not+Available'; };
            const label = document.createElement('span');
            label.textContent = res.name;

            item.addEventListener('click', () => {
                thumbnailList.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedThumbnail = { url: res.url, name: res.name };
            });

            item.appendChild(img);
            item.appendChild(label);
            thumbnailList.appendChild(item);
        });

        thumbnailResolutions.style.display = 'block';
        if (resolutions.length > 0) {
            thumbnailList.firstChild.classList.add('selected');
            selectedThumbnail = { url: resolutions[0].url, name: resolutions[0].name };
        }
    }

    function downloadThumbnail(url, name) {
        const spinner = downloadThumbnailBtn.querySelector('.spinner');
        spinner.style.display = 'inline';
        downloadThumbnailBtn.disabled = true;

        try {
            if (!url || url.includes('via.placeholder.com')) {
                throw new Error('Không có thumbnail để tải');
            }

            fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    const sanitizedTitle = sanitizeFileName(title.textContent || 'thumbnail');
                    const sanitizedName = sanitizeFileName(name.replace(/\s*\([^)]+\)/g, ''));
                    a.download = `${sanitizedTitle}_${sanitizedName}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(blobUrl);

                    Swal.fire({
                        title: 'Thành công',
                        text: 'Đã tải thumbnail thành công!',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false,
                        customClass: {
                            popup: 'swal-popup',
                            title: 'swal-title',
                            content: 'swal-content'
                        }
                    });
                })
                .catch(error => {
                    throw new Error('Không thể tải hình ảnh: ' + error.message);
                });
        } catch (error) {
            Swal.fire({
                title: 'Lỗi',
                text: error.message || 'Không thể tải thumbnail. Vui lòng thử lại!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
        } finally {
            spinner.style.display = 'none';
            downloadThumbnailBtn.disabled = false;
        }
    }

    async function downloadContent(type, btn, apiEndpoint, successMessage, downloadLabel) {
        const rawUrl = videoUrlInput.value;
        const url = normalizeUrl(rawUrl);
        const platform = detectPlatform(url);
        const quality = document.querySelector('input[name="quality"]:checked')?.value || 'high';
        const language = type === 'subtitle' ? subtitleLanguage.value : null;
        const format = type === 'subtitle' ? subtitleFormat.value : null;

        if (!platform) {
            Swal.fire({
                title: 'Lỗi',
                text: 'Vui lòng nhập link hợp lệ và nhấn Tải Ngay!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            return;
        }

        if (type === 'subtitle' && (!language || !format)) {
            Swal.fire({
                title: 'Lỗi',
                text: 'Vui lòng chọn ngôn ngữ và định dạng phụ đề!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            return;
        }

        const spinner = btn.querySelector('.spinner');
        spinner.style.display = 'inline';
        btn.disabled = true;

        let progressPopup = Swal.fire({
            title: `Đang tải ${type === 'video' ? 'video' : type === 'audio' ? 'âm thanh' : 'phụ đề'}...`,
            html: `
                <div class="progress-wrapper">
                    <div class="progress-container">
                        <div class="progress-bar" id="progressBar">
                            <div class="progress-fill"></div>
                        </div>
                        <div class="progress-text" id="progressText">0%</div>
                        <div class="progress-status" id="progressStatus">Đang chuẩn bị tải...</div>
                    </div>
                    <div class="loading-spinner">
                        <div class="spinner-circle"></div>
                    </div>
                </div>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            customClass: {
                popup: 'swal-popup',
                title: 'swal-title',
                content: 'swal-content',
                progressBar: 'swal-progress-bar'
            }
        });

        // Thêm CSS cho thanh tiến trình
        const style = document.createElement('style');
        style.textContent = `
            .progress-wrapper {
                padding: 20px;
                text-align: center;
            }
            .progress-container {
                margin-bottom: 15px;
            }
            .progress-bar {
                width: 100%;
                height: 20px;
                background-color: #f0f0f0;
                border-radius: 10px;
                overflow: hidden;
                position: relative;
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
            }
            .progress-fill {
                width: 0%;
                height: 100%;
                background: linear-gradient(45deg, #2196F3, #00BCD4);
                border-radius: 10px;
                transition: width 0.2s ease;
                position: relative;
                overflow: hidden;
            }
            .progress-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(
                    45deg,
                    rgba(255,255,255,0.2) 25%,
                    transparent 25%,
                    transparent 50%,
                    rgba(255,255,255,0.2) 50%,
                    rgba(255,255,255,0.2) 75%,
                    transparent 75%,
                    transparent
                );
                background-size: 30px 30px;
                animation: progress-animation 1s linear infinite;
            }
            .progress-text {
                margin-top: 10px;
                font-size: 16px;
                color: #666;
                font-weight: bold;
            }
            .progress-status {
                margin-top: 5px;
                font-size: 14px;
                color: #888;
            }
            .loading-spinner {
                margin-top: 15px;
            }
            .spinner-circle {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #2196F3;
                border-radius: 50%;
                margin: 0 auto;
                animation: spin 1s linear infinite;
            }
            @keyframes progress-animation {
                0% { background-position: 0 0; }
                100% { background-position: 30px 0; }
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url, 
                    platform, 
                    type, 
                    quality, 
                    targetLanguage: language, 
                    formatPreference: format, 
                    videoId: currentVideoId 
                })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Có lỗi xảy ra khi tải nội dung');
            }

            if (data.message === 'Đang tải, vui lòng chờ...') {
                const downloadId = data.downloadId;
                let eventSource = new EventSource(`/api/download-progress/${downloadId}`);
                let lastProgress = 0;

                eventSource.onmessage = (event) => {
                    const progressData = JSON.parse(event.data);
                    const progress = Math.min(progressData.progress, 100);
                    const status = progressData.status || 'Đang tải...';
                    
                    const progressFill = document.querySelector('.progress-fill');
                    const progressText = document.getElementById('progressText');
                    const progressStatus = document.getElementById('progressStatus');
                    
                    // Cập nhật tiến trình mượt mà
                    if (progress > lastProgress) {
                        const updateProgress = () => {
                            if (lastProgress < progress) {
                                lastProgress = Math.min(lastProgress + 1, progress);
                                progressFill.style.width = `${lastProgress}%`;
                                progressText.textContent = `${lastProgress}%`;
                                
                                if (lastProgress < progress) {
                                    setTimeout(updateProgress, 20);
                                }
                            }
                        };
                        updateProgress();
                    }
                    
                    // Cập nhật trạng thái
                    progressStatus.textContent = status;

                    if (progress === 100) {
                        eventSource.close();
                        Swal.close();
                        Swal.fire({
                            title: `Tải ${type === 'video' ? 'video' : type === 'audio' ? 'âm thanh' : 'phụ đề'} hoàn tất!`,
                            html: `
                                <p>Nhấn nút bên dưới để tải ${type === 'video' ? 'video' : type === 'audio' ? 'âm thanh' : 'phụ đề'}.</p>
                                <div class="custom-download-btn-container">
                                    <button id="downloadConfirmBtn" class="custom-download-btn">
                                        <i class="fas fa-download"></i> Download ${downloadLabel}
                                    </button>
                                </div>
                            `,
                            showConfirmButton: false,
                            didOpen: () => {
                                const downloadBtn = document.getElementById('downloadConfirmBtn');
                                downloadBtn.addEventListener('click', () => {
                                    const link = document.createElement('a');
                                    link.href = data.downloadUrl;
                                    const sanitizedTitle = sanitizeFileName(title.textContent || 'content');
                                    const extension = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : `${language}.${format}`;
                                    link.download = `${sanitizedTitle}.${extension}`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    Swal.close();
                                    resultDiv.innerHTML = `${successMessage}`;
                                });
                            },
                            customClass: {
                                popup: 'swal-popup',
                                title: 'swal-title',
                                content: 'swal-content'
                            }
                        });
                    }

                    if (progressData.error) {
                        eventSource.close();
                        Swal.close();
                        Swal.fire({
                            title: 'Lỗi tải xuống',
                            text: progressData.error || 'Có lỗi xảy ra khi tải nội dung. Vui lòng thử lại!',
                            icon: 'error',
                            confirmButtonText: 'OK',
                            customClass: {
                                popup: 'swal-popup',
                                title: 'swal-title',
                                content: 'swal-content',
                                confirmButton: 'swal-button'
                            }
                        });
                    }
                };

                eventSource.onerror = () => {
                    eventSource.close();
                    Swal.close();
                    Swal.fire({
                        title: 'Lỗi tải xuống',
                        text: 'Không thể theo dõi tiến trình tải. Vui lòng thử lại!',
                        icon: 'error',
                        confirmButtonText: 'OK',
                        customClass: {
                            popup: 'swal-popup',
                            title: 'swal-title',
                            content: 'swal-content',
                            confirmButton: 'swal-button'
                        }
                    });
                };
            } else if (data.downloadUrl) {
                // Tải hoàn tất ngay lập tức (file đã có sẵn)
                const progressBar = document.getElementById('progressBar');
                const progressText = document.getElementById('progressText');
                
                // Hiển thị tiến trình mượt mà từ 0 đến 100
                let progress = 0;
                const updateProgress = () => {
                    if (progress < 100) {
                        progress++;
                        progressBar.style.width = `${progress}%`;
                        progressText.textContent = `${progress}%`;
                        setTimeout(updateProgress, 20);
                    } else {
                        Swal.close();
                        Swal.fire({
                            title: `Tải ${type === 'video' ? 'video' : type === 'audio' ? 'âm thanh' : 'phụ đề'} hoàn tất!`,
                            html: `
                                <p>Nhấn nút bên dưới để tải ${type === 'video' ? 'video' : type === 'audio' ? 'âm thanh' : 'phụ đề'}.</p>
                                <div class="custom-download-btn-container">
                                    <button id="downloadConfirmBtn" class="custom-download-btn">
                                        <i class="fas fa-download"></i> Download ${downloadLabel}
                                    </button>
                                </div>
                            `,
                            showConfirmButton: false,
                            didOpen: () => {
                                const downloadBtn = document.getElementById('downloadConfirmBtn');
                                downloadBtn.addEventListener('click', () => {
                                    const link = document.createElement('a');
                                    link.href = data.downloadUrl;
                                    const sanitizedTitle = sanitizeFileName(title.textContent || 'content');
                                    const extension = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : `${language}.${format}`;
                                    link.download = `${sanitizedTitle}.${extension}`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    Swal.close();
                                    resultDiv.innerHTML = `${successMessage}`;
                                });
                            },
                            customClass: {
                                popup: 'swal-popup',
                                title: 'swal-title',
                                content: 'swal-content'
                            }
                        });
                    }
                };
                updateProgress();
            } else if (data.images) {
                // Tải ảnh (cho Instagram, v.v.)
                data.images.forEach((url, index) => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `image_${index + 1}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
                resultDiv.innerHTML = 'Đã tải ảnh thành công!';
                Swal.close();
                Swal.fire({
                    title: 'Thành công',
                    text: 'Đã tải ảnh thành công!',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'swal-popup',
                        title: 'swal-title',
                        content: 'swal-content'
                    }
                });
            } else {
                throw new Error('Không tìm thấy nội dung để tải.');
            }
        } catch (error) {
            Swal.close();
            resultDiv.classList.remove('loading');
            resultDiv.innerHTML = '';
            Swal.fire({
                title: 'Lỗi tải xuống',
                text: error.message || 'Có lỗi xảy ra khi tải nội dung. Vui lòng thử lại!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
        } finally {
            spinner.style.display = 'none';
            btn.disabled = false;
        }
    }

    videoUrlInput.addEventListener('input', async () => {
        const rawUrl = videoUrlInput.value;
        const url = normalizeUrl(rawUrl);

        if (!rawUrl) {
            updatePlatformIcon(null);
            contentPreview.style.display = 'none';
            currentVideoId = null;
            return;
        }

        if (!isValidUrl(url)) {
            updatePlatformIcon(null);
            contentPreview.style.display = 'none';
            Swal.fire({
                title: 'Link không hợp lệ',
                text: 'Vui lòng nhập một URL hợp lệ (ví dụ: https://youtu.be/...)',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            return;
        }

        const platform = detectPlatform(url);
        if (platform) {
            updatePlatformIcon(platform);
            try {
                const metadata = await fetchMetadata(url, platform);
                currentVideoId = metadata.videoId;
            } catch (error) {
                Swal.fire({
                    title: 'Lỗi',
                    text: error.message || 'Không thể lấy dữ liệu. Vui lòng thử lại!',
                    icon: 'error',
                    confirmButtonText: 'OK',
                    customClass: {
                        popup: 'swal-popup',
                        title: 'swal-title',
                        content: 'swal-content',
                        confirmButton: 'swal-button'
                    }
                });
            }
        } else {
            updatePlatformIcon(null);
            contentPreview.style.display = 'none';
            Swal.fire({
                title: 'Nền tảng không được hỗ trợ',
                text: 'Vui lòng dán link từ TikTok, Instagram, YouTube, Twitter/X, Facebook hoặc Douyin.',
                icon: 'warning',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
        }
    });

    copyTitleBtn.addEventListener('click', () => {
        const text = title.textContent;
        navigator.clipboard.writeText(text).then(() => {
            Swal.fire({
                title: 'Đã sao chép',
                text: 'Tiêu đề đã được sao chép!',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content'
                }
            });
        }).catch(err => {
            Swal.fire({
                title: 'Lỗi',
                text: 'Không thể sao chép tiêu đề!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
        });
    });

    fetchBtn.addEventListener('click', async () => {
        const rawUrl = videoUrlInput.value;
        const url = normalizeUrl(rawUrl);

        if (!rawUrl) {
            Swal.fire({
                title: 'Lỗi',
                text: 'Vui lòng nhập link nội dung!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            return;
        }

        if (!isValidUrl(url)) {
            Swal.fire({
                title: 'Link không hợp lệ',
                text: 'Vui lòng nhập một URL hợp lệ.',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            return;
        }

        const platform = detectPlatform(url);
        if (!platform) {
            Swal.fire({
                title: 'Nền tảng không được hỗ trợ',
                text: 'Vui lòng dán link từ TikTok, Instagram, YouTube, Twitter/X, Facebook hoặc Douyin.',
                icon: 'warning',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            return;
        }

        resultDiv.classList.add('loading');
        resultDiv.innerHTML = 'Đang lấy dữ liệu...';

        try {
            const metadata = await fetchMetadata(url, platform);
            currentVideoId = metadata.videoId;
            thumbnail.src = metadata.thumbnail || 'https://via.placeholder.com/300x150?text=Thumbnail+Not+Available';
            title.textContent = metadata.title || (platform === 'youtube' ? 'Video YouTube mẫu' : 'Mẫu tiêu đề video');

            contentPreview.style.display = 'flex';
            contentPreview.classList.add('active');
            resultDiv.classList.remove('loading');
            resultDiv.innerHTML = '';

            if (platform === 'youtube') {
                const videoId = getYouTubeVideoId(url);
                if (videoId) {
                    displayThumbnailResolutions(videoId);
                } else {
                    thumbnailResolutions.style.display = 'none';
                }
            } else {
                thumbnailResolutions.style.display = 'none';
            }
        } catch (error) {
            resultDiv.classList.remove('loading');
            Swal.fire({
                title: 'Lỗi',
                text: error.message || 'Không thể lấy dữ liệu. Vui lòng thử lại!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
        }

        updatePlatformIcon(platform);
    });

    downloadVideoBtn.addEventListener('click', () => downloadContent('video', downloadVideoBtn, '/api/download', 'Đã tải video thành công!', 'Video'));
    downloadAudioBtn.addEventListener('click', () => downloadContent('audio', downloadAudioBtn, '/api/download', 'Đã tải âm thanh thành công!', 'Âm Thanh'));
    downloadSubtitleBtn.addEventListener('click', () => downloadContent('subtitle', downloadSubtitleBtn, '/api/download-subtitle', 'Đã tải phụ đề thành công!', 'Phụ Đề'));

    downloadThumbnailBtn.addEventListener('click', () => {
        const spinner = downloadThumbnailBtn.querySelector('.spinner');
        spinner.style.display = 'inline';
        downloadThumbnailBtn.disabled = true;

        try {
            if (!selectedThumbnail || !selectedThumbnail.url || selectedThumbnail.url.includes('via.placeholder.com')) {
                throw new Error('Vui lòng chọn một thumbnail hợp lệ');
            }

            downloadThumbnail(selectedThumbnail.url, selectedThumbnail.name);
        } catch (error) {
            Swal.fire({
                title: 'Lỗi',
                text: error.message || 'Không thể tải thumbnail. Vui lòng thử lại!',
                icon: 'error',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal-popup',
                    title: 'swal-title',
                    content: 'swal-content',
                    confirmButton: 'swal-button'
                }
            });
            spinner.style.display = 'none';
            downloadThumbnailBtn.disabled = false;
        }
    });
});