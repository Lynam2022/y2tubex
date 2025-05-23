const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Danh sách các dependencies cần thiết
const requiredDependencies = {
    dependencies: [
        '@distube/ytdl-core',
        'axios',
        'dotenv',
        'express',
        'express-rate-limit',
        'fluent-ffmpeg',
        'jsdom',
        'rate-limiter-flexible',
        'uuid',
        'winston',
        'yt-dlp-exec',
        '@ffmpeg-installer/ffmpeg'
    ],
    devDependencies: [
        'nodemon'
    ]
};

// Hàm kiểm tra xem một package đã được cài đặt chưa
function isPackageInstalled(packageName) {
    try {
        require.resolve(packageName);
        return true;
    } catch (e) {
        return false;
    }
}

// Hàm cài đặt FFmpeg
async function installFFmpeg() {
    try {
        // Kiểm tra xem FFmpeg đã được cài đặt chưa
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('✅ FFmpeg đã được cài đặt');
        return true;
    } catch (e) {
        console.log('📦 Đang cài đặt FFmpeg...');
        
        try {
            // Cài đặt @ffmpeg-installer/ffmpeg nếu chưa có
            if (!isPackageInstalled('@ffmpeg-installer/ffmpeg')) {
                execSync('npm install @ffmpeg-installer/ffmpeg', { stdio: 'inherit' });
            }

            // Lấy đường dẫn FFmpeg từ @ffmpeg-installer/ffmpeg
            const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
            
            // Tạo thư mục bin nếu chưa tồn tại
            const binDir = path.join(__dirname, 'bin');
            if (!fs.existsSync(binDir)) {
                fs.mkdirSync(binDir);
            }

            // Sao chép FFmpeg vào thư mục bin
            const targetPath = path.join(binDir, os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
            fs.copyFileSync(ffmpegPath, targetPath);

            // Cấp quyền thực thi trên Linux/macOS
            if (os.platform() !== 'win32') {
                fs.chmodSync(targetPath, '755');
            }

            // Thêm đường dẫn vào PATH tạm thời
            const pathEnv = process.env.PATH || '';
            process.env.PATH = `${binDir}${path.delimiter}${pathEnv}`;

            console.log('✅ FFmpeg đã được cài đặt thành công');
            return true;
        } catch (error) {
            console.error('❌ Lỗi khi cài đặt FFmpeg:', error.message);
            console.log('⚠️ Vui lòng cài đặt FFmpeg thủ công:');
            console.log('Windows: https://ffmpeg.org/download.html');
            console.log('Linux: sudo apt-get install ffmpeg');
            console.log('macOS: brew install ffmpeg');
            return false;
        }
    }
}

// Hàm cài đặt các dependencies
async function installDependencies() {
    console.log('🔍 Kiểm tra và cài đặt các thư viện cần thiết...');

    // Kiểm tra và cài đặt dependencies
    const missingDeps = requiredDependencies.dependencies.filter(dep => !isPackageInstalled(dep));
    const missingDevDeps = requiredDependencies.devDependencies.filter(dep => !isPackageInstalled(dep));

    if (missingDeps.length > 0) {
        console.log('📦 Đang cài đặt các dependencies còn thiếu...');
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
    }

    if (missingDevDeps.length > 0) {
        console.log('📦 Đang cài đặt các devDependencies còn thiếu...');
        execSync(`npm install --save-dev ${missingDevDeps.join(' ')}`, { stdio: 'inherit' });
    }

    // Cài đặt FFmpeg
    await installFFmpeg();

    // Kiểm tra và tạo các thư mục cần thiết
    const requiredDirs = ['downloads', 'subtitles', 'temp', 'bin'];
    requiredDirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath);
            console.log(`📁 Đã tạo thư mục ${dir}`);
        }
    });

    // Kiểm tra file .env
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        const envContent = `PORT=3000
YOUTUBE_API_KEY=your_youtube_api_key
RAPIDAPI_KEY=your_rapidapi_key`;
        fs.writeFileSync(envPath, envContent);
        console.log('⚠️ Đã tạo file .env mẫu. Vui lòng cập nhật các API key trong file .env');
    }

    console.log('✅ Hoàn tất kiểm tra và cài đặt!');
}

// Chạy cài đặt
installDependencies(); 