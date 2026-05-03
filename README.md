# 🗺️ AI-Powered Navigation System (Hanoi Map)

Ứng dụng tìm đường thông minh tích hợp dữ liệu bản đồ thực tế từ OpenStreetMap và Google Places API, áp dụng các thuật toán tìm kiếm tối ưu trong Trí tuệ nhân tạo (AI).

> Dự án thuộc môn học: **IT3160 — Nhập môn Trí tuệ Nhân tạo** | ĐH Bách Khoa Hà Nội (HUST).

---

## 🚀 Tính năng chính

- **Dữ liệu thực tế:** Sử dụng `OSMnx` để tải mạng lưới đường bộ thực tế của khu vực Giảng Võ, Ba Đình, Hà Nội.
- **Tìm kiếm thông minh:** Tích hợp **Google Maps Places API** để tìm kiếm địa điểm, tòa nhà, cửa hàng một cách chính xác.
- **Đa thuật toán:** Hỗ trợ và so sánh trực quan 5 thuật toán tìm kiếm phổ biến:
  - **A* Search** (Tối ưu nhất)
  - **Dijkstra**
  - **Greedy Best-First Search**
  - **BFS** (Breadth-First Search)
  - **DFS** (Depth-First Search)
- **Sự kiện giao thông:** Mô phỏng các sự kiện động như **tắc đường (giảm 70% tốc độ)** hoặc **chặn đường (tai nạn, bảo trì)**. Thuật toán sẽ tự động tính toán lại lộ trình để tránh các điểm này.
- **Trực quan hóa:** Hiển thị đường đi thực tế (bám theo độ cong của đường) và các node đã duyệt trên nền bản đồ Leaflet.js.

---

## 🛠️ Cài đặt & Chạy ứng dụng

### 1. Yêu cầu hệ thống
- Python 3.8+
- Trình duyệt web hiện đại (Chrome, Edge, Firefox)

### 2. Cài đặt môi trường
Mở terminal tại thư mục dự án và chạy:

```bash
# Tạo môi trường ảo
python -m venv venv

# Kích hoạt môi trường ảo (Windows)
.\venv\Scripts\activate

# Cài đặt thư viện
pip install -r requirements.txt
```

### 3. Cấu hình Google Maps API Key
Dự án sử dụng Google Places để tìm kiếm địa điểm. Để kích hoạt:
1. Copy file `.env.example` thành `.env`.
2. Mở file `.env` và dán API Key của bạn vào:
   ```env
   GOOGLE_MAPS_API_KEY=AIzaSy...your_key_here
   ```

### 4. Khởi tạo dữ liệu bản đồ
Chạy script để tải và lưu dữ liệu bản đồ khu vực Giảng Võ:
```bash
python src/graph_builder.py
```

### 5. Chạy Server
Khởi động backend Flask:
```bash
python server.py
```
Sau đó truy cập địa chỉ: `http://127.0.0.1:5000` trên trình duyệt.

---

## 📂 Cấu trúc thư mục

```text
Map-Finding/
├── src/                    # Logic xử lý Backend
│   ├── algorithms.py       # Triển khai 5 thuật toán tìm kiếm
│   ├── graph_builder.py    # Tải dữ liệu từ OpenStreetMap
│   ├── events.py           # Quản lý sự kiện giao thông
│   └── utils.py            # Các hàm hỗ trợ (Haversine, v.v.)
├── web/                    # Giao diện người dùng (Frontend)
│   ├── index.html          # Cấu trúc trang (Jinja2 Template)
│   ├── style.css           # Giao diện (Dark Mode)
│   └── app.js              # Logic tương tác bản đồ
├── data/                   # Lưu trữ graph.json (tự động tạo)
├── .env                    # Cấu hình API Key (không commit)
├── server.py               # File chạy chính (Flask Server)
└── requirements.txt        # Danh sách thư viện cần thiết
```

---

## 🧠 Thuật toán & Trọng số

Trọng số của các cạnh trong đồ thị được tính toán dựa trên **thời gian di chuyển thực tế**:
$$Weight = \frac{Length}{Speed \times TrafficFactor}$$

- **Length:** Chiều dài đoạn đường (mét).
- **Speed:** Tốc độ giới hạn của đoạn đường (km/h).
- **TrafficFactor:**
  - `1.0`: Bình thường.
  - `0.3`: Tắc đường (Chậm hơn ~3 lần).
  - `0.0`: Chặn hoàn toàn (Cạnh bị loại khỏi đồ thị).

---

## 📝 Giấy phép

Dự án được phát triển cho mục đích học tập. Mọi thắc mắc vui lòng liên hệ tác giả.
