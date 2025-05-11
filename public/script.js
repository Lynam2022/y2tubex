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

    // Biến lưu thumbnail đã chọn
    let selectedThumbnail = null;

    // Hàm chuẩn hóa URL
    function normalizeUrl(url) {
        if (!url) return '';
        url = url.trim();
        if (!url.match(/^https?:\/\//)) {
            url = 'https://' + url;
        }
        return url;
    }

    // Hàm kiểm tra URL hợp lệ
    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // Hàm nhận diện nền tảng từ URL
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

    // Hàm cập nhật logo nền tảng
    function updatePlatformIcon(platform) {
        platformIcon.classList.remove('active', 'fa-tiktok', 'fa-instagram', 'fa-youtube', 'fa-twitter', 'fa-facebook', 'fa-douyin');
        if (platform) {
            const iconClass = platform === 'douyin' ? 'fa-douyin' : `fa-${platform}`;
            platformIcon.classList.add('active', iconClass);
        }
    }

    // Hàm lấy metadata
    async function fetchMetadata(url, platform) {
        try {
            const response = await fetch('/api/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, platform })
            });
            const data = await response.json();
            if (!data.title) {
                data.title = platform === 'youtube' ? 'Video YouTube mẫu' : 'Mẫu tiêu đề video';
            }
            return data;
        } catch (error) {
            console.error('Metadata Error:', error);
            return { thumbnail: '', title: platform === 'youtube' ? 'Video YouTube mẫu' : 'Mẫu tiêu đề video' };
        }
    }

    // Hàm lấy video ID từ URL YouTube
    function getYouTubeVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    // Hàm hiển thị các độ phân giải thumbnail
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

            // Sự kiện chọn thumbnail
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
            thumbnailList.firstChild.classList.add('selected'); // Mặc định chọn HD
            selectedThumbnail = { url: resolutions[0].url, name: resolutions[0].name };
        }
    }

    // Hàm tải thumbnail dưới dạng .jpg
    function downloadThumbnail(url, name) {
        const spinner = downloadThumbnailBtn.querySelector('.spinner');
        spinner.style.display = 'inline';
        downloadThumbnailBtn.disabled = true;

        try {
            if (!url || url.includes('via.placeholder.com')) {
                throw new Error('Không có thumbnail để tải');
            }

            // Fetch hình ảnh để đảm bảo tải đúng định dạng .jpg
            fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `${title.textContent || 'thumbnail'}_${name.replace(/\s*\([^)]+\)/g, '')}.jpg`; // Đặt tên file
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(blobUrl); // Giải phóng bộ nhớ

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

    // Hàm tải phụ đề
    async function downloadSubtitle() {
        const rawUrl = videoUrlInput.value;
        const url = normalizeUrl(rawUrl);
        const language = subtitleLanguage.value;
        const format = subtitleFormat.value;
        const platform = detectPlatform(url);

        // Kiểm tra đầu vào
        if (!rawUrl) {
            Swal.fire({
                title: 'Lỗi',
                text: 'Vui lòng nhập link nội dung và nhấn Tải Ngay!',
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

        if (!language || !format) {
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

        const spinner = downloadSubtitleBtn.querySelector('.spinner');
        spinner.style.display = 'inline';
        downloadSubtitleBtn.disabled = true;

        resultDiv.classList.add('loading');
        resultDiv.innerHTML = 'Đang tải phụ đề...';

        try {
            const response = await fetch('/api/download-subtitle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, platform, language, format })
            });

            const data = await response.json();

            if (data.success && data.downloadUrl) {
                const link = document.createElement('a');
                link.href = data.downloadUrl;
                link.download = `${title.textContent || 'subtitle'}_${language}.${format}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                resultDiv.classList.remove('loading');
                resultDiv.innerHTML = 'Đã tải phụ đề thành công!';

                Swal.fire({
                    title: 'Thành công',
                    text: 'Đã tải phụ đề thành công!',
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
                throw new Error(data.message || 'Không tìm thấy phụ đề để tải');
            }
        } catch (error) {
            resultDiv.classList.remove('loading');
            resultDiv.innerHTML = '';
            Swal.fire({
                title: 'Lỗi',
                text: error.message || 'Không thể tải phụ đề. Vui lòng thử lại!',
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
            downloadSubtitleBtn.disabled = false;
        }
    }

    // Xử lý sự kiện input
    videoUrlInput.addEventListener('input', () => {
        const rawUrl = videoUrlInput.value;
        const url = normalizeUrl(rawUrl);

        if (!rawUrl) {
            updatePlatformIcon(null);
            contentPreview.style.display = 'none';
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

    // Sao chép tiêu đề
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

    // Xử lý khi nhấn "Tải Ngay"
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
            thumbnail.src = metadata.thumbnail || 'https://via.placeholder.com/300x150?text=Thumbnail+Not+Available';
            title.textContent = metadata.title || (platform === 'youtube' ? 'Video YouTube mẫu' : 'Mẫu tiêu đề video');

            contentPreview.style.display = 'flex';
            contentPreview.classList.add('active');
            resultDiv.classList.remove('loading');
            resultDiv.innerHTML = '';

            // Hiển thị các độ phân giải thumbnail nếu là YouTube
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
                text: 'Không thể lấy dữ liệu. Vui lòng thử lại!',
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

    // Hàm tải nội dung (tự động tải xuống)
    async function download(type) {
        const rawUrl = videoUrlInput.value;
        const url = normalizeUrl(rawUrl);
        const quality = document.querySelector('input[name="quality"]:checked').value;
        const platform = detectPlatform(url);

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

        resultDiv.classList.add('loading');
        resultDiv.innerHTML = `Đang tải ${type === 'video' ? 'video' : 'âm thanh'}...`;

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, platform, type, quality })
            });
            const data = await response.json();

            resultDiv.classList.remove('loading');

            if (data.error) {
                Swal.fire({
                    title: 'Lỗi tải xuống',
                    text: data.error,
                    icon: 'error',
                    confirmButtonText: 'OK',
                    customClass: {
                        popup: 'swal-popup',
                        title: 'swal-title',
                        content: 'swal-content',
                        confirmButton: 'swal-button'
                    }
                });
                resultDiv.innerHTML = '';
                return;
            }

            if (data.downloadUrl) {
                const link = document.createElement('a');
                link.href = data.downloadUrl;
                link.download = `${title.textContent || 'content'}_${type}.${type === 'video' ? 'mp4' : 'mp3'}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                resultDiv.innerHTML = `Đã tải ${type === 'video' ? 'video' : 'âm thanh'} thành công!`;
                Swal.fire({
                    title: 'Thành công',
                    text: `Đã tải ${type === 'video' ? 'video' : 'âm thanh'} thành công!`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'swal-popup',
                        title: 'swal-title',
                        content: 'swal-content'
                    }
                });
            } else if (data.images) {
                data.images.forEach((url, index) => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `image_${index + 1}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
                resultDiv.innerHTML = 'Đã tải ảnh thành công!';
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
                resultDiv.innerHTML = '';
                Swal.fire({
                    title: 'Lỗi tải xuống',
                    text: 'Không tìm thấy nội dung để tải. Vui lòng thử lại!',
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
        } catch (error) {
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
        }
    }

    // Xử lý tải video
    downloadVideoBtn.addEventListener('click', () => download('video'));

    // Xử lý tải âm thanh
    downloadAudioBtn.addEventListener('click', () => download('audio'));

    // Xử lý tải thumbnail
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

    // Xử lý tải phụ đề
    downloadSubtitleBtn.addEventListener('click', () => downloadSubtitle());
});