# TỪ ĐIỂN ĐA NGÔN NGỮ (DECOY VENEER)
## Zero-Knowledge Ephemeral Drop & Anonymous In-Memory Messaging System

Hệ thống truyền tin bảo mật cao cấp tuân thủ nghiêm ngặt mô hình **Zero-Trust (Không Tin Cậy Máy Chủ)**, lưu trữ hoàn toàn trên **bộ nhớ đệm (RAM-Only)**, tích hợp thuật toán mã hóa **AES-256-GCM**, bắt tay khóa **ECDH P-256 + HKDF-SHA256**, cơ chế **Tự hủy (Burn-After-Reading)**, và được ngụy trang (Steganography) hoàn hảo dưới dạng **Từ Điển Đa Ngôn Ngữ**.

---

### 1. Kiến Trúc Mật Mã Học & Luồng Dữ Liệu (Cryptographic Flow)

```
[ NGƯỜI GỬI (CLIENT A) ]                           [ MÁY CHỦ TRUNG CHUYỂN (RAM BUFFER) ]               [ NGƯỜI NHẬN (CLIENT B) ]
       │                                                              │                                       │
       ├─ Sinh Khóa AES-256-GCM (K)                                   │                                       │
       ├─ Sinh IV 96-bit ngẫu nhiên                                    │                                       │
       ├─ Mã hóa: C = AES-GCM(K, IV, Plaintext)                       │                                       │
       ├─ Ghép gói: Package = [IV: 12B] + [Ciphertext + Tag: 16B]      │                                       │
       │                                                              │                                       │
       ├──── POST /api/lexicon/cache-entry (Chỉ gửi Package, KHÔNG K) ───► [Lưu Package vào RAM Map]          │
       │     ◄─── Trả về Drop ID (128-bit hex) ───────────────────────┤ (Không ghi Disk, Không lưu Log)       │
       │                                                              │                                       │
       ├─ Tạo URL: https://domain/#entry?id=<DropID>&k=<KeyB64>       │                                       │
       │  (Key nằm sau dấu '#' nên KHÔNG BAO GIỜ gửi lên Server)       │                                       │
       │                                                              │                                       │
       └──── (Gửi URL qua kênh bảo mật ngoài) ───────────────────────────────────────────────────────────────►│
                                                                      │                                       ├─ Nhận URL: #entry?id=...&k=...
                                                                      │                                       ├─ Tách Key (K) từ hash (URL bar)
                                                                      │◄── GET /api/lexicon/cache-entry/<ID> ─┤
                                                                      │    (Chỉ hỏi ID, Server không biết K)  │
                                                                      ├─ Trả về Package                       │
                                                                      ├─ [ATOMIC BURN]: Xóa ngay khỏi RAM ────┤
                                                                      │                                       ├─ Trích xuất IV (12B đầu)
                                                                      │                                       ├─ Web Crypto: Giải mật C bằng K
                                                                      │                                       ├─ Hiển thị Plaintext (RAM only)
                                                                      │                                       ├─ Xóa URL Fragment (replaceState)
                                                                      │                                       └─ Đếm lùi tự hủy trên màn hình
```

---

### 2. Các Trụ Cột Kỹ Thuật Cốt Lõi (Core Technical Pillars)

#### A. Zero-Knowledge Proof & Client-Side Encryption
- **Mã hóa nguyên bản:** Sử dụng tiêu chuẩn chuẩn hóa **W3C Web Crypto API** (`window.crypto.subtle`), không phụ thuộc vào thư viện bên ngoài để tránh tấn công chuỗi cung ứng (Supply Chain Attack).
- **Thuật toán đối xứng:** **AES-256-GCM** (Galois/Counter Mode). Mỗi thông điệp sử dụng một IV (Initialization Vector) 96-bit sinh từ CSPRNG (`crypto.getRandomValues`). Thẻ xác thực tính toàn vẹn (GCM Authentication Tag) 128-bit đảm bảo chống mọi hình thức can thiệp (Tamper-Resistant / AEAD).
- **Bắt tay P2P ẩn danh:** Hỗ trợ trao đổi khóa **ECDH NIST P-256** kết hợp hàm dẫn xuất khóa **HKDF-SHA256 (RFC 5869)** giúp thiết lập phiên trò chuyện hai chiều hoàn toàn trong RAM, bảo đảm thuộc tính **Bí mật Chuyển tiếp Hoàn hảo (Perfect Forward Secrecy - PFS)**.

#### B. Ephemeral Storage (Bộ nhớ RAM Khả biến)
- **Tuyệt đối không ghi đĩa:** Máy chủ quản lý các Drop bằng `Map` trên bộ nhớ Heap/RAM của Node.js process. Không có bất kỳ lệnh ghi tập tin, SQLite, Redis hay Persistence Adapter nào.
- **Atomic Burn-After-Reading:** Thao tác đọc dữ liệu là một hàm nguyên tử (atomic read-and-delete). Ngay khi client nhận được bytes ciphertext, đối tượng sẽ bị xóa khỏi `Map`, và bộ nhớ `Buffer` được ghi đè bằng `0` (`buf.fill(0)`) trước khi trả lại cho V8 Garbage Collector.
- **Bộ quét TTL (Active Sweeper):** Chạy ngầm mỗi 5 giây, tự động dọn dẹp các bản ghi hết hạn (Time-To-Live) kể cả khi chưa có người truy cập.
- **Chống tràn RAM (DoS Shield):** Giới hạn mỗi gói Drop tối đa **5 MB**, tổng dung lượng lưu trữ tối đa **100 MB**.

#### C. Lưu lượng Mạng & Triệt tiêu Dấu vết (Traffic & Anti-Forensics)
- **Bảo vệ chống phân tích lưu lượng (Traffic Analysis Defense):** Áp dụng kỹ thuật độn dữ liệu ngẫu nhiên CSPRNG theo bội số 256 bytes (`Constant-Boundary Random Length Padding`). Kẻ quan sát lưu lượng mạng hoặc bộ nhớ RAM không thể suy đoán độ dài thực tế của thông điệp.
- **Bảo vệ 2 Lớp (Dual-Factor Passphrase):** Tùy chọn mật khẩu cấp 2 kết hợp hàm băm dẫn xuất khóa **PBKDF2-HMAC-SHA256 (100.000 vòng lặp)** hòa trộn cùng khóa URL ngẫu nhiên qua HKDF.
- **Chống tấn công từ chối dịch vụ (Anti-DoS Rate Limiter):** Bộ giới hạn tần suất truy vấn trượt hoàn toàn trong RAM (150 req/phút).
- **Tự động xóa Clipboard (Clipboard Auto-Wiping):** Tự hủy làm sạch dữ liệu trong clipboard hệ điều hành sau 30 giây khi sao chép link hoặc bản tin.
- **Màn che học thuật (Academic Decoy Mask - F2):** Nhấn `F2` để lập tức biến màn hình bí mật thành một bài báo nghiên cứu ngôn ngữ học vô hại chống nhìn trộm (Anti-Shoulder Surfing).
- **Zero-Log:** Toàn bộ access log, IP logging, User-Agent, và Referer bị vô hiệu hóa hoàn toàn trên tầng HTTP Server.
- **Bảo mật phân đoạn URL (RFC 3986 §3.5):** Khóa giải mã được định vị tại Fragment Identifier (`#entry?id=...&k=...`). Trình duyệt không bao giờ gửi phân đoạn sau dấu '#' trong request headers đến server.

#### D. Ngụy trang (Steganography / Decoy Veneer) & Thanh Tìm Kiếm Đa Nền Tảng (Omnibox)
- Giao diện mặc định hoạt động như một công cụ **Từ Điển Đa Ngôn Ngữ & Tra Cứu Bách Khoa Toàn Thư (Wikipedia)** với đầy đủ tính năng tra cứu từ vựng thật.
- **Tích hợp tìm kiếm đa nền tảng trực tiếp ngay trên thanh tìm kiếm (Omnibox):**
  1. **Nút chuyển đổi nền tảng tích hợp trong thanh:** Ngay bên trái ô nhập liệu, người dùng có thể chuyển đổi linh hoạt giữa: `Wikipedia (VI)`, `Wikipedia (EN)`, `Wiktionary`, `Google` và `Từ Điển`.
  2. **Gợi ý tự động thời gian thực (Live OpenSearch Dropdown):** Khi gõ từ vựng vào thanh tìm kiếm, một menu gợi ý thông minh đổ xuống ngay dưới thanh tìm kiếm hiển thị các bài viết liên quan trực tiếp từ Wikipedia.
  3. **Thực thi tìm kiếm tức thì:** Nhấn `Enter` hoặc nút `[🔍 Tìm kiếm]` để truy vấn trực tiếp bài viết tương ứng trên nền tảng đã chọn.
  4. **Cơ chế kích hoạt chuyển hướng bí mật:** Khi gõ đúng từ khóa bí mật (**`:drop`**, **`vault`**, **`//drop`**, **`:secure`**, **`matrix`**, **`mật mã`**), ô tìm kiếm sẽ phát tín hiệu bảo mật (viền xanh) và lập tức **chuyển hướng (Redirect)** trình duyệt sang trang bảng điều khiển chuyên biệt độc lập: **`/vault.html`** (hoặc route `/vault`).
  5. Trên trang Vault, tích hợp phím nóng **`ESC`** hoặc nút **`[🚨 THOÁT KHẨN CẤP]`** để ngay lập tức ghi đè xóa sạch dữ liệu trong RAM trình duyệt và quay trở lại trang từ điển vô hại.

---

### 3. Cấu Trúc Mã Nguồn

```
d:\Tu_Dien_Da_Ngon_Ngu\
├── package.json                   # Cấu hình dự án & kịch bản kiểm thử
├── server.js                      # HTTP Server RAM-Only, Zero-Log, Lexicon API & Drop Store
├── public\
│   ├── index.html                 # Giao diện Dual-Mode (Từ điển + Modal Drop bảo mật)
│   ├── css\
│   │   └── style.css              # Giao diện tra cứu học thuật & Stealth Crypto Theme
│   └── js\
│       ├── crypto-engine.js       # Module Mật mã học thuần Web Crypto API (AES-GCM, ECDH, HKDF)
│       ├── decoy-dictionary.js    # Dữ liệu từ vựng đa ngôn ngữ ngụy trang
│       └── app.js                 # Bộ điều khiển chính, xử lý URL Fragment & phiên P2P
└── tests\
    ├── crypto-engine.test.js      # Kiểm thử mã hóa/giải mã, chống giả mạo, dẫn xuất khóa
    └── server.test.js             # Kiểm thử RAM-only, Burn-After-Reading, TTL, DoS limits
```

---

### 4. Hướng Dẫn Vận Hành & Kiểm Thử

#### Khởi chạy máy chủ:
```powershell
cd d:\Tu_Dien_Da_Ngon_Ngu
npm start
```
Dịch vụ sẽ hoạt động tại `http://localhost:3000`.

#### Chạy toàn bộ Test Suite (11/11 tests pass):
```powershell
cd d:\Tu_Dien_Da_Ngon_Ngu
npm test
```
