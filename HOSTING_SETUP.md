# Hướng dẫn Upload Frontend lên Hosting

## 1. Chuẩn bị file

1. Tạo thư mục mới cho hosting:
```bash
mkdir y2tubex.com
```

2. Copy toàn bộ nội dung từ thư mục `public` vào thư mục gốc của hosting:
```bash
cp -r public/* y2tubex.com/
```

3. Cấu trúc thư mục sau khi copy sẽ như sau:
```
y2tubex.com/
├── index.html
├── download.html
├── downloads.html
├── terms-of-service.html
├── privacy-policy.html
├── script.js           # File từ thư mục public/
├── style.css
├── styles.css
├── favicon.ico
└── assets/
    ├── download-svgrepo-com.svg  # Nếu có
    └── (các file assets khác)
```

## 2. Upload lên Hosting

1. Upload toàn bộ nội dung thư mục `y2tubex.com` lên thư mục gốc của hosting (thường là `public_html` hoặc `www`)

2. Đảm bảo các quyền truy cập file:
```bash
# Trên hosting, set quyền cho các file
chmod 644 *.html *.js *.css *.ico
chmod 755 assets/
```

## 3. Kiểm tra

1. Truy cập website qua các URL:
   - https://y2tubex.com
   - https://y2tubex.com/download.html
   - https://y2tubex.com/downloads.html
   - https://y2tubex.com/terms-of-service.html
   - https://y2tubex.com/privacy-policy.html

2. Kiểm tra các chức năng:
   - Form nhập URL video
   - Nút tải xuống
   - Hiển thị thông tin video
   - Tải phụ đề

## 4. Xử lý lỗi thường gặp

1. Nếu gặp lỗi 404:
   - Kiểm tra đường dẫn file trong HTML
   - Đảm bảo tên file và thư mục đúng chính xác (phân biệt chữ hoa/thường)

2. Nếu gặp lỗi CORS:
   - Kiểm tra kết nối đến backend (http://103.232.121.180:3000)
   - Đảm bảo backend đã cấu hình CORS đúng

3. Nếu gặp lỗi JavaScript:
   - Kiểm tra console trong Developer Tools
   - Đảm bảo các file JS được load đúng thứ tự
   - Kiểm tra đường dẫn API trong script.js

## 5. Lưu ý quan trọng

1. KHÔNG cần upload các file sau:
   - Thư mục `node_modules`
   - File `package.json`
   - File `package-lock.json`
   - File `HOSTING_SETUP.md`
   - File `script.js` trong thư mục gốc frontend (chỉ dùng file trong public/)
   - Các file cấu hình khác

2. CẦN upload các file sau:
   - Tất cả file HTML từ thư mục public/
   - File `script.js` từ thư mục public/ (đã cập nhật API endpoint)
   - Tất cả file CSS
   - Tất cả file assets (hình ảnh, icons) từ thư mục public/assets/
   - File favicon.ico

3. Bảo mật:
   - Đảm bảo không có thông tin nhạy cảm trong code
   - Kiểm tra các API endpoint trong script.js
   - Sử dụng HTTPS cho website 