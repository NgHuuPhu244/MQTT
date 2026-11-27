# Nexus Workspace — Hệ Thống Giao Tiếp & Điều Hành Nội Bộ Khép Kín (v8.5)

Nền tảng web giao tiếp, điều phối dự án, quản trị nhân sự và bàn giao thông tin mật nội bộ cho doanh nghiệp, áp dụng mô hình **kiểm soát truy cập theo vai trò 3 cấp (RBAC)**, giao tiếp thời gian thực bằng **WebSocket chuẩn RFC 6455 thuần (0 thư viện ngoài)**, bảo vệ mật khẩu bằng **`scrypt`** và bàn giao thông tin mật **AES-256-GCM + PBKDF2-HMAC-SHA256 tự hủy 1 lần trên RAM**.

---

## 1. Kiến Trúc Giao Thức & Bảo Mật

```
[ TRÌNH DUYỆT (CLIENT - MỖI TAB 1 PHIÊN ĐỘC LẬP) ]
   ├── Giao diện Obsidian Studio (WCAG 2.1 AA) — public/index.html, vault.js, style.css
   ├── Web Crypto API (public/js/crypto-engine.js) — AES-256-GCM + PBKDF2 (100k vòng) + Padding 256B
   ├── WebSocket Client (ws://host/ws/company) — Xác thực gói tin đầu, nhận Sync & Online Presence < 50ms
   └── HTTP/1.1 REST Client — Header X-Session-Token + tải tệp đính kèm qua Blob URL (không lộ token trên URL)
                                      │
                                      ▼
[ MÁY CHỦ NODE.JS (server.js + src/ws-server.js) ]
   ├── Tầng WebSocket RFC 6455 (src/ws-server.js) — SHA-1 Handshake, Masked Frames, Ping/Pong Heartbeat, RBAC Pub/Sub
   ├── Tầng Xác thực & Chống lạm dụng — Scrypt + Salt 16B, Session TTL 8h, Anti-Brute-Force 429, CORS Whitelist, CSP
   ├── Bộ Lưu Trữ Bền Vững Nội Bộ (data/company-state.json & data/company-attachments/) — Ghi nguyên tử (Atomic Write)
   └── Bộ Đệm RAM Tự Hủy 1 Lần (/api/lexicon/cache-entry) — Zero-Knowledge Drop, buf.fill(0) ngay sau lần đọc đầu tiên
```

### Tách bạch Ranh Giới Lưu Trữ
- **Lưu bền vững cục bộ (`data/` — được loại trừ khỏi Git qua `.gitignore`):** Tài khoản nhân sự (chỉ lưu chuỗi băm `scrypt:<salt>:<hash>`), dự án phòng ban, phòng chat, lịch sử tin nhắn, tệp đính kèm (`<= 2MB`), hàng đợi phê duyệt và nhật ký giám sát.
- **Lưu 100% RAM khả biến (không ghi đĩa):** Token phiên đăng nhập (`companySessions`) và các bản mã bàn giao mật tự hủy 1 lần (`inMemoryStore`).

---

## 2. Ma Trận Phân Quyền 3 Cấp (Closed-Company RBAC)

| Chức năng | Nhân viên (`employee`) | Quản lí (`manager`) | Giám đốc (`director`) |
| :--- | :---: | :---: | :---: |
| Xem dự án & tài nguyên | Chỉ ban mình | Chỉ ban mình | Toàn công ty (lọc theo 4 ban) |
| Tạo / Thu hồi dự án & Giao việc | Chặn (`403`) *(chỉ cập nhật tiến độ)* | Trong ban mình | Toàn công ty |
| Vào phòng chat ban & công việc | Chỉ phòng `active` thuộc ban mình | Ban mình + phòng lãnh đạo được mời | Giám sát toàn bộ các phòng |
| Tạo phòng chat mới | Chặn (`403`) | Đề xuất phòng Ban / Công việc (`pending_create` — chờ Giám đốc duyệt) | Tạo trực tiếp (`active`), gồm cả phòng **QL ↔ QL** & **QL ↔ GĐ** |
| Xóa phòng chat / Xóa từng tin nhắn | Chặn (`403`) | Gửi yêu cầu xóa (`pending_delete` — chờ Giám đốc duyệt) | Phê duyệt/Từ chối hoặc xóa trực tiếp |
| Quản lý nhân sự (`Nhân Sự & Ban`) | Chặn (`403`) | Thêm & khóa/mở khóa Nhân viên trong ban mình | Thêm, điều chuyển ban & khóa/mở khóa cả Quản lí và Nhân viên |
| Đổi mật khẩu & Bàn giao mật AES-256-GCM | Có | Có | Có |

---

## 3. Đặc Tả API Chính & Kênh WebSocket

### WebSocket Thời Gian Thực (`/ws/company` — RFC 6455)
- **Client → Server:** `{"type":"auth","token":"<sessionToken>"}` (xác thực ngay sau `onopen`, không truyền token qua query string), `{"type":"ping"}`.
- **Server → Client:**
  - `{"type":"auth_ok","protocol":"RFC6455-WS","onlineCount":N,"onlineUserIds":[...]}`
  - `{"type":"presence","onlineCount":N,"onlineUserIds":[...]}` *(phân phạm vi theo RBAC)*
  - `{"type":"sync","reason":"room_message | room_approved | project_created | ..."}`
  - `{"type":"session_revoked","reason":"..."}` *(đẩy tức thì khi tài khoản bị khóa và đóng socket mã `4001`)*

### REST API Công Ty (`/api/company/*`)
- **Xác thực:** `POST /api/company/login`, `POST /api/company/logout`, `POST /api/company/change-password`, `GET /api/company/accounts-directory`, `GET /api/company/state`.
- **Dự án & Công việc:** `POST /api/company/projects`, `DELETE /api/company/projects/:id`, `PATCH /api/company/projects/:id/task`.
- **Phòng chat, Tin nhắn & Phê duyệt:** `POST /api/company/rooms/request-create`, `POST /api/company/rooms/:id/request-delete`, `POST /api/company/approvals/:roomId/decide`, `POST /api/company/rooms/:id/messages`, `GET /api/company/rooms/:id/attachments/:attId` *(header-only auth)*, `POST /api/company/rooms/:id/messages/:msgId/request-delete`, `POST /api/company/approvals/messages/:roomId/:msgId/decide`.
- **Nhân sự:** `POST /api/company/managers`, `PATCH /api/company/managers/:userId`, `POST /api/company/employees`, `PATCH /api/company/employees/:userId`.
- **Bàn giao mật RAM-Only:** `POST /api/lexicon/cache-entry`, `GET /api/lexicon/cache-entry/:id` *(tự hủy nguyên tử sau 1 lần đọc)*.

---

## 4. Tài Khoản Kiểm Thử Khởi Tạo (Mật khẩu mặc định: `123`)

Mỗi tab trình duyệt lưu token phiên riêng trong `sessionStorage`, cho phép mở song song 3 tab để đối chiếu trực tiếp 3 vai trò:

| Vai trò | Tên đăng nhập | Phòng ban |
| :--- | :--- | :--- |
| **Giám đốc** | `giamdoc` | Toàn Công Ty |
| **Quản lí** | `ql.devops`, `ql.it`, `ql.net`, `ql.fin` | DevOps · Hành chính IT · Mạng & An ninh · Tài chính |
| **Nhân viên** | `nv.devops1`, `nv.it1`, `nv.net1`, `nv.fin1` | DevOps · Hành chính IT · Mạng & An ninh · Tài chính |

---

## 5. Cấu Trúc Mã Nguồn & Chạy Kiểm Thử

```text
d:\Tu_Dien_Da_Ngon_Ngu\
├── server.js                      # HTTP/1.1 Server, RBAC Engine, Scrypt Auth, Atomic JSON Store & RAM Drops
├── src/
│   └── ws-server.js               # RFC 6455 WebSocket Server thuần & RBAC Presence/Event Hub
├── public/
│   ├── index.html                 # Giao diện đơn trang thống nhất Nexus Workspace
│   ├── css/style.css              # Hệ thống thiết kế Obsidian Studio (WCAG 2.1 AA)
│   └── js/
│       ├── vault.js               # Bộ điều khiển Client (RBAC UI, WS Client, Blob Attachments, Handover)
│       ├── crypto-engine.js       # Web Crypto API (AES-256-GCM, PBKDF2-HMAC-SHA256, ECDH, HKDF)
│       └── qrcode.mjs             # Tạo mã QR nội bộ không gọi dịch vụ ngoài
└── tests/
    ├── crypto-engine.test.js      # Kiểm thử mật mã học (8 tests)
    └── server.test.js             # Kiểm thử RAM Drop, RBAC 3 cấp, Persistence, WebSocket & Bảo mật (22 tests)
```

### Khởi chạy & Kiểm thử
```powershell
npm start        # Chạy máy chủ tại http://localhost:3000 (HTTP/1.1 + WebSocket)
npm test         # Chạy toàn bộ bộ kiểm thử tự động Node Test Runner
```
