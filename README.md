# Video Downloader Application

Ứng dụng tải video và phụ đề được tách thành frontend và backend riêng biệt.

## Cấu trúc thư mục

- `frontend/`: Chứa code giao diện người dùng
- `backend/`: Chứa code xử lý server và API

## Cài đặt và chạy

### Backend

1. Di chuyển vào thư mục backend:
```bash
cd backend
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Chạy server:
```bash
node server.js
```

Server sẽ chạy tại http://localhost:3000

### Frontend

1. Di chuyển vào thư mục frontend:
```bash
cd frontend
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Chạy frontend:
```bash
npm start
```

Frontend sẽ chạy tại http://localhost:5000

## Sử dụng

1. Mở trình duyệt và truy cập http://localhost:5000
2. Nhập URL video cần tải
3. Chọn các tùy chọn phù hợp
4. Nhấn nút tải xuống