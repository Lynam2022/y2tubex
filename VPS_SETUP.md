# Hướng dẫn cài đặt Backend trên VPS

## 1. Cài đặt các công cụ cần thiết

### 1.1. Cài đặt Node.js
```bash
# Cài đặt Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Kiểm tra phiên bản
node --version
npm --version
```

### 1.2. Cài đặt FFmpeg
```bash
sudo apt update
sudo apt install -y ffmpeg

# Kiểm tra phiên bản
ffmpeg -version
```

### 1.3. Cài đặt yt-dlp
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Kiểm tra phiên bản
yt-dlp --version
```

### 1.4. Cài đặt PM2 (Process Manager)
```bash
sudo npm install -g pm2

# Kiểm tra phiên bản
pm2 --version
```

## 2. Tải và cài đặt code

### 2.1. Tạo thư mục cho ứng dụng
```bash
# Tạo thư mục
mkdir -p /var/www/y2tubex
cd /var/www/y2tubex

# Clone repository từ GitHub
git clone https://github.com/Lynam2022/backend.git .

# Cài đặt dependencies
npm install
```

### 2.2. Tạo file .env
```bash
# Tạo file .env
cat > .env << 'EOL'
PORT=3000
YOUTUBE_API_KEY=your_youtube_api_key
RAPIDAPI_KEY=your_rapidapi_key

# Cấu hình thư mục
DOWNLOAD_DIR=/var/www/y2tubex/downloads
TEMP_DIR=/var/www/y2tubex/temp
LOGS_DIR=/var/www/y2tubex/logs

# Cấu hình timeout và rate limit
REQUEST_TIMEOUT=300000
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Cấu hình CORS
CORS_ORIGIN=https://y2tubex.com
EOL

# Tạo các thư mục cần thiết
mkdir -p downloads temp logs

# Cấp quyền cho thư mục
sudo chown -R $USER:$USER /var/www/y2tubex
chmod -R 755 /var/www/y2tubex
```

### 2.3. Cấu hình PM2
```bash
# Tạo file ecosystem.config.js
cat > ecosystem.config.js << 'EOL'
module.exports = {
  apps: [{
    name: 'y2tubex-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
EOL

# Khởi động ứng dụng với PM2
pm2 start ecosystem.config.js

# Cấu hình PM2 khởi động cùng hệ thống
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

### 2.4. Cấu hình Nginx (nếu cần)
```bash
# Cài đặt Nginx
sudo apt install -y nginx

# Tạo file cấu hình
sudo nano /etc/nginx/sites-available/y2tubex

# Thêm nội dung sau:
server {
    listen 80;
    server_name 103.232.121.180;
    
    # Chặn các request từ check-host.net
    if ($http_user_agent ~* "check-host.net") {
        return 403;
    }
    
    # Giới hạn kích thước request
    client_max_body_size 10M;
    
    # Timeout settings
    client_body_timeout 10s;
    client_header_timeout 10s;
    keepalive_timeout 65;
    send_timeout 10s;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;
    limit_req zone=one burst=20 nodelay;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # CORS settings
    add_header 'Access-Control-Allow-Origin' 'https://y2tubex.com' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting cho API endpoints
        location ~ ^/api/ {
            limit_req zone=one burst=20 nodelay;
            proxy_pass http://localhost:3000;
        }
        
        # Cache static files
        location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }
    }
    
    # Chặn truy cập vào các file nhạy cảm
    location ~ /\. {
        deny all;
    }
    
    location ~* \.(git|env|config|json|lock|log)$ {
        deny all;
    }
}

# Tạo symbolic link
sudo ln -s /etc/nginx/sites-available/y2tubex /etc/nginx/sites-enabled/

# Kiểm tra cấu hình Nginx
sudo nginx -t

# Khởi động lại Nginx
sudo systemctl restart nginx
```

### 2.5. Cấu hình Firewall (UFW)
```bash
# Cài đặt UFW
sudo apt install -y ufw

# Cấu hình mặc định
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Mở các port cần thiết
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Bật firewall
sudo ufw enable

# Kiểm tra trạng thái
sudo ufw status
```

### 2.6. Cấu hình Fail2ban
```bash
# Cài đặt Fail2ban
sudo apt install -y fail2ban

# Tạo file cấu hình
sudo nano /etc/fail2ban/jail.local

# Thêm nội dung sau:
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
port = http,https
logpath = /var/log/nginx/access.log

# Khởi động lại Fail2ban
sudo systemctl restart fail2ban
```

### 2.7. Cấu hình Node.js Security
```bash
# Cài đặt các package bảo mật
npm install --save helmet express-rate-limit cors dotenv

# Tạo file middleware/security.js
cat > middleware/security.js << 'EOL'
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Giới hạn 100 request mỗi IP
    message: 'Quá nhiều request từ IP này, vui lòng thử lại sau 15 phút'
});

// CORS options
const corsOptions = {
    origin: 'https://y2tubex.com',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 giờ
};

module.exports = {
    helmet: helmet(),
    limiter,
    cors: cors(corsOptions)
};
EOL

# Cập nhật server.js để sử dụng middleware bảo mật
cat > server.js << 'EOL'
const express = require('express');
const { helmet, limiter, cors } = require('./middleware/security');

const app = express();

// Áp dụng middleware bảo mật
app.use(helmet);
app.use(cors);
app.use('/api/', limiter);

// ... rest of your server code ...
EOL
```

## 3. Kiểm tra và bảo trì

### 3.1. Kiểm tra ứng dụng
```bash
# Kiểm tra trạng thái ứng dụng
pm2 status

# Xem logs
pm2 logs y2tubex-backend

# Kiểm tra port
sudo netstat -tulpn | grep 3000
```

### 3.2. Các lệnh bảo trì
```bash
# Khởi động lại ứng dụng
pm2 restart y2tubex-backend

# Dừng ứng dụng
pm2 stop y2tubex-backend

# Xóa ứng dụng khỏi PM2
pm2 delete y2tubex-backend

# Cập nhật code
cd /var/www/y2tubex
git pull
npm install
pm2 restart y2tubex-backend
```

## 4. Lưu ý quan trọng

1. Thay thế `your_youtube_api_key` và `your_rapidapi_key` trong file `.env` bằng API key thực tế của bạn
2. Đảm bảo các port cần thiết (80, 443) đã được mở trong firewall
3. Thường xuyên kiểm tra logs để phát hiện và xử lý lỗi
4. Backup dữ liệu định kỳ
5. Cập nhật các package thường xuyên để đảm bảo an toàn
6. Giám sát tài nguyên hệ thống để phát hiện tấn công DDoS
7. Cấu hình SSL/TLS cho HTTPS
8. Thường xuyên quét lỗ hổng bảo mật

## 5. Xử lý sự cố

### 5.1. Kiểm tra logs
```bash
# Xem logs của ứng dụng
pm2 logs y2tubex-backend

# Xem logs của Nginx
sudo tail -f /var/log/nginx/error.log
```

### 5.2. Kiểm tra tài nguyên
```bash
# Kiểm tra CPU và RAM
htop

# Kiểm tra dung lượng ổ đĩa
df -h

# Kiểm tra các process đang chạy
ps aux | grep node
```

### 5.3. Khởi động lại các service
```bash
# Khởi động lại ứng dụng
pm2 restart y2tubex-backend

# Khởi động lại Nginx
sudo systemctl restart nginx
```

### 5.4. Xử lý tấn công DDoS
```bash
# Kiểm tra các kết nối đang mở
sudo netstat -tulpn | grep ESTABLISHED

# Kiểm tra số lượng request
sudo tail -f /var/log/nginx/access.log | grep -v "check-host.net"

# Chặn IP đáng ngờ
sudo fail2ban-client status
sudo fail2ban-client set nginx-http-auth banip <IP_ADDRESS>

# Giới hạn số lượng kết nối
sudo nano /etc/sysctl.conf
# Thêm các dòng sau:
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5

# Áp dụng cấu hình
sudo sysctl -p
```

### 5.5. Kiểm tra bảo mật
```bash
# Kiểm tra cấu hình SSL
curl -vI https://y2tubex.com

# Kiểm tra headers bảo mật
curl -I https://y2tubex.com

# Quét lỗ hổng với nmap
sudo nmap -sV -sC -p- y2tubex.com

# Kiểm tra logs bảo mật
sudo tail -f /var/log/fail2ban.log
sudo tail -f /var/log/nginx/error.log
``` 