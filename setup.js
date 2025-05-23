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
        
        // Kiểm tra codec MP3
        try {
            execSync('ffmpeg -codecs | findstr mp3', { stdio: 'ignore' });
            console.log('✅ FFmpeg đã được cài đặt với codec MP3');
            return true;
        } catch (e) {
            console.log('⚠️ FFmpeg đã cài đặt nhưng thiếu codec MP3, đang cài đặt lại...');
        }
    } catch (e) {
        console.log('📦 Đang cài đặt FFmpeg...');
    }
    
    try {
        // Xác định hệ điều hành và kiến trúc
        const platform = os.platform();
        const arch = os.arch();
        console.log(`📋 Hệ điều hành: ${platform}, Kiến trúc: ${arch}`);

        if (platform === 'linux') {
            // Kiểm tra phiên bản Ubuntu
            try {
                const lsbInfo = execSync('lsb_release -a', { encoding: 'utf8' });
                console.log('📋 Thông tin hệ thống:', lsbInfo);
            } catch (e) {
                console.log('⚠️ Không thể lấy thông tin LSB, tiếp tục cài đặt...');
            }

            // Tạo thư mục bin nếu chưa tồn tại
            const binDir = path.join(__dirname, 'bin');
            if (!fs.existsSync(binDir)) {
                fs.mkdirSync(binDir);
            }

            // Tải FFmpeg static build
            console.log('📥 Đang tải FFmpeg static build...');
            const ffmpegVersion = '7.0';
            const ffmpegUrl = `https://johnvansickle.com/ffmpeg/releases/ffmpeg-${ffmpegVersion}-linux64-lgpl.tar.xz`;
            const zipPath = path.join(binDir, 'ffmpeg.tar.xz');
            
            // Tải file
            execSync(`wget ${ffmpegUrl} -O ${zipPath}`, { stdio: 'inherit' });
            
            // Giải nén
            console.log('📦 Đang giải nén FFmpeg...');
            execSync(`tar -xJf ${zipPath} -C ${binDir}`, { stdio: 'inherit' });
            
            // Di chuyển file FFmpeg
            const extractedDir = path.join(binDir, `ffmpeg-${ffmpegVersion}-linux64-lgpl`);
            const ffmpegPath = path.join(extractedDir, 'ffmpeg');
            const targetPath = path.join(binDir, 'ffmpeg');
            
            fs.copyFileSync(ffmpegPath, targetPath);
            fs.chmodSync(targetPath, '755');
            
            // Xóa file tạm
            fs.unlinkSync(zipPath);
            fs.rmSync(extractedDir, { recursive: true, force: true });
            
            // Thêm đường dẫn vào PATH
            const pathEnv = process.env.PATH || '';
            process.env.PATH = `${binDir}${path.delimiter}${pathEnv}`;
            
        } else if (platform === 'win32') {
            // Windows: Tải và cài đặt FFmpeg với codec MP3
            const binDir = path.join(__dirname, 'bin');
            if (!fs.existsSync(binDir)) {
                fs.mkdirSync(binDir);
            }

            const ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
            const zipPath = path.join(binDir, 'ffmpeg.zip');
            
            // Tải FFmpeg
            execSync(`curl -L ${ffmpegUrl} -o ${zipPath}`, { stdio: 'inherit' });
            
            // Giải nén
            execSync(`powershell Expand-Archive -Path ${zipPath} -DestinationPath ${binDir} -Force`, { stdio: 'inherit' });
            
            // Di chuyển file FFmpeg
            const extractedPath = path.join(binDir, 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe');
            const targetPath = path.join(binDir, 'ffmpeg.exe');
            fs.copyFileSync(extractedPath, targetPath);
            
            // Xóa file tạm
            fs.unlinkSync(zipPath);
            fs.rmSync(path.join(binDir, 'ffmpeg-master-latest-win64-gpl'), { recursive: true, force: true });
            
            // Thêm đường dẫn vào PATH
            const pathEnv = process.env.PATH || '';
            process.env.PATH = `${binDir}${path.delimiter}${pathEnv}`;
            
        } else if (platform === 'darwin') {
            // macOS: Cài đặt FFmpeg với codec MP3
            execSync('brew install ffmpeg', { stdio: 'inherit' });
        }

        // Kiểm tra lại FFmpeg và codec MP3
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
            execSync('ffmpeg -codecs | findstr mp3', { stdio: 'ignore' });
            console.log('✅ FFmpeg đã được cài đặt thành công với codec MP3');
            return true;
        } catch (e) {
            // Nếu vẫn không có codec MP3, thử cài đặt qua package manager
            console.log('⚠️ Đang cài đặt FFmpeg qua package manager...');
            
            if (platform === 'linux') {
                execSync('sudo apt-get update && sudo apt-get install -y ffmpeg', { stdio: 'inherit' });
            } else if (platform === 'darwin') {
                execSync('brew install ffmpeg', { stdio: 'inherit' });
            }

            // Kiểm tra lại lần cuối
            execSync('ffmpeg -version', { stdio: 'ignore' });
            execSync('ffmpeg -codecs | findstr mp3', { stdio: 'ignore' });
            console.log('✅ FFmpeg đã được cài đặt thành công với codec MP3');
            return true;
        }
    } catch (error) {
        console.error('❌ Lỗi khi cài đặt FFmpeg:', error.message);
        console.log('⚠️ Vui lòng cài đặt FFmpeg thủ công:');
        console.log('Windows: https://ffmpeg.org/download.html');
        console.log('Linux: sudo apt-get install ffmpeg');
        console.log('macOS: brew install ffmpeg');
        return false;
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