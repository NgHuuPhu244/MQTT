/**
 * @file server.js
 * @description Zero-Knowledge Ephemeral RAM-Only Server disguised as a Multilingual Dictionary API & Web App.
 * 
 * Core Architectural Mandates:
 * 1. Strictly RAM-only: Data stored in volatile memory Map. Never written to disk.
 * 2. Zero-Log Policy: No access logs, no IP tracking, no User-Agent logging.
 * 3. Atomic Burn-After-Reading: Ciphertext purged from RAM on initial retrieval.
 * 4. Active TTL Sweeper: Automatic eviction of expired items with buffer zeroing.
 * 5. Memory-DoS Shield: Enforces strict maximum payload size and total memory ceiling.
 * 6. Decoy & Steganography: Camouflaged as "Từ Điển Đa Ngôn Ngữ" with real lexical search endpoints.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Configuration & Constraints
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5 MB per drop
const MAX_TOTAL_RAM_BYTES = 100 * 1024 * 1024; // 100 MB max total drop buffer
const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const MAX_TTL_SECONDS = 86400 * 7; // Max 7 days
const SWEEP_INTERVAL_MS = 5000; // Sweep expired drops every 5s

// Anti-DoS Rate Limiter (In-Memory Sliding Window Bucket)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5000; // max 5000 requests per minute for real-time multi-window sync

function checkRateLimit(clientKey) {
  const now = Date.now();
  let record = rateLimitMap.get(clientKey);
  if (!record || (now - record.startTime) > RATE_LIMIT_WINDOW_MS) {
    record = { startTime: now, count: 1 };
    rateLimitMap.set(clientKey, record);
    return true;
  }
  record.count++;
  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now - v.startTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(k);
    }
  }
}, 30000).unref();

/**
 * In-Memory Ephemeral Storage
 * Map<string, EphemeralDrop>
 * 
 * EphemeralDrop:
 * {
 *   id: string,
 *   ciphertextBuffer: Buffer,
 *   burnAfterReading: boolean,
 *   expiresAt: number,
 *   size: number
 * }
 */
const inMemoryStore = new Map();
let currentTotalRAMBytes = 0;

/**
 * In-Memory Bazaar Products Registry (RAM-Only, Zero-Log)
 * Allows distributed sellers and buyers to list, bid, and buy without disk writes.
 */
const INITIAL_BAZAAR_PRODUCTS = [
  {
    id: 'auction-chip-07',
    name: 'Triển Khai Cụm Gateway API & HSM Nội Bộ Q4',
    category: 'hardware',
    badge: 'Phòng DevOps',
    icon: '🖥️',
    securityLevel: 'Nội bộ • Mức Cao',
    currency: 'Giờ',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 16,
    currentBidXMR: 24,
    buyNowPrice: 32,
    minBidIncrement: 0,
    bidCount: 4,
    highestBidder: 'NV-DevOps-04',
    bids: [
      { bidder: 'NV-DevOps-04', amount: 24, currency: 'Giờ', time: '2 phút trước' },
      { bidder: 'NV-Lead-02', amount: 20, currency: 'Giờ', time: '8 phút trước' },
      { bidder: 'NV-BE-08', amount: 18, currency: 'Giờ', time: '15 phút trước' },
      { bidder: 'NV-Sec-01', amount: 16, currency: 'Giờ', time: '28 phút trước' }
    ],
    auctionEndTime: Date.now() + (5400 * 1000),
    priceXMR: '24 Giờ',
    rawPriceXMR: 24,
    approxUSD: 'Sprint 14 • DevOps',
    stock: 'Đang mở phối hợp',
    desc: 'Kế hoạch nâng cấp cụm máy chủ Gateway và module xác thực nội bộ. Thành viên các nhóm có thể ước lượng thời gian hỗ trợ hoặc nhận bàn giao cấu hình.',
    specs: {
      'Phòng ban': 'DevOps & Hạ tầng Hệ thống',
      'Trạng thái': 'Đang tiếp nhận đề xuất nhân sự',
      'Bàn giao': 'Tài liệu kỹ thuật & Token một lần'
    }
  },
  {
    id: 'lux-watch-08',
    name: 'Cấp Phát Laptop Workstation & Thẻ Từ Văn Phòng Mới',
    category: 'physical',
    badge: 'Hành Chính & IT',
    icon: '💻',
    securityLevel: 'Tài sản Công ty',
    currency: 'Thiết bị',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 5,
    currentBidXMR: 8,
    buyNowPrice: 12,
    minBidIncrement: 0,
    bidCount: 6,
    highestBidder: 'NV-IT-02',
    bids: [
      { bidder: 'NV-IT-02', amount: 8, currency: 'Thiết bị', time: '5 phút trước' },
      { bidder: 'NV-HR-05', amount: 6, currency: 'Thiết bị', time: '19 phút trước' }
    ],
    auctionEndTime: Date.now() + (10800 * 1000),
    priceXMR: '8 Thiết bị',
    rawPriceXMR: 8,
    approxUSD: 'Tầng 5 • Kho IT',
    stock: 'Sẵn sàng cấp phát',
    desc: 'Danh sách thiết bị phần cứng phục vụ nhân sự mới tháng 11. Các trưởng nhóm đăng ký số lượng và nhận mã bàn giao qua kênh nội bộ.',
    specs: {
      'Phòng ban': 'Hành chính Nhân sự & IT Helpdesk',
      'Hình thức': 'Đăng ký số lượng / Nhận bàn giao ngay',
      'Bàn giao': 'Phòng IT Tầng 5 • Ký nhận điện tử'
    }
  },
  {
    id: 'dig-domain-09',
    name: 'Tài Khoản Cloud Staging & Bộ Biến Môi Trường (.env)',
    category: 'digital',
    badge: 'Tài Nguyên Số',
    icon: '☁️',
    securityLevel: 'AES-256 • Nội bộ',
    currency: 'Ngày',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 7,
    currentBidXMR: 14,
    buyNowPrice: 30,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'NV-Lead-01',
    bids: [
      { bidder: 'NV-Lead-01', amount: 14, currency: 'Ngày', time: '11 phút trước' }
    ],
    auctionEndTime: Date.now() + (7200 * 1000),
    priceXMR: '14 Ngày',
    rawPriceXMR: 14,
    approxUSD: 'AWS / GCP Staging',
    stock: 'Cấp quyền tạm thời',
    desc: 'Thông tin truy cập môi trường kiểm thử Staging và bộ biến môi trường (.env) được mã hóa một lần, tự hủy ngay sau khi thành viên tải về.',
    specs: {
      'Phòng ban': 'Backend & QA Testing',
      'Hiệu lực': 'Gia hạn theo chu kỳ Sprint',
      'Bàn giao': 'Secret Token tự hủy trong RAM'
    }
  },
  {
    id: 'hw-hsm-01',
    name: 'Khóa Xác Thực YubiKey & Token Ký Code Production',
    category: 'hardware',
    badge: 'Phần Cứng IT',
    icon: '🔑',
    securityLevel: 'Chuẩn FIDO2',
    currency: 'Chiếc',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 2,
    currentBidXMR: 5,
    buyNowPrice: 5,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'NV-Sec-09',
    bids: [
      { bidder: 'NV-Sec-09', amount: 5, currency: 'Chiếc', time: '14 phút trước' }
    ],
    auctionEndTime: Date.now() + (14400 * 1000),
    priceXMR: '5 Chiếc',
    rawPriceXMR: 5,
    approxUSD: 'Phòng Kỹ Thuật',
    stock: 'Còn 5 khóa',
    desc: 'Khóa bảo mật vật lý dùng để xác thực 2FA khi deploy lên hệ thống Production và ký số mã nguồn nội bộ công ty.',
    specs: {
      'Tiêu chuẩn': 'FIDO2 / WebAuthn / PGP Hardware',
      'Phạm vi': 'Tech Lead & Quản trị viên hệ thống',
      'Bàn giao': 'Nhận trực tiếp hoặc mã PIN qua RAM'
    }
  },
  {
    id: 'net-mesh-02',
    name: 'Cấu Hình VPN WireGuard Truy Cập Server Nội Bộ',
    category: 'network',
    badge: 'Hạ Tầng Mạng',
    icon: '🌐',
    securityLevel: 'Zero-Trust VPN',
    currency: 'Profile',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 1,
    currentBidXMR: 3,
    buyNowPrice: 10,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'NV-Net-03',
    bids: [],
    auctionEndTime: Date.now() + (18000 * 1000),
    priceXMR: '3 Profile',
    rawPriceXMR: 3,
    approxUSD: 'Gateway HN & HCM',
    stock: 'Sẵn sàng cấp phát',
    desc: 'File cấu hình WireGuard dành cho nhân viên làm việc từ xa (Remote) để truy cập vào mạng nội bộ và cơ sở dữ liệu công ty an toàn.',
    specs: {
      'Giao thức': 'WireGuard Encrypted Tunnel',
      'Phạm vi': 'Nhân viên toàn thời gian & Remote',
      'Bàn giao': 'Mã tải cấu hình tự hủy sau 1 lần đọc'
    }
  },
  {
    id: 'sec-ssl-03',
    name: 'Chứng Chỉ SSL Nội Bộ & Quyền Truy Cập GitLab Private',
    category: 'network',
    badge: 'Hệ Thống',
    icon: '🛡️',
    securityLevel: 'SSH / TLS 1.3',
    currency: 'Nhóm',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 2,
    currentBidXMR: 4,
    buyNowPrice: 8,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'NV-Ops-07',
    bids: [],
    auctionEndTime: Date.now() + (21600 * 1000),
    priceXMR: '4 Nhóm',
    rawPriceXMR: 4,
    approxUSD: 'Core Infrastructure',
    stock: 'Đang hoạt động',
    desc: 'Bộ chứng chỉ Root CA nội bộ để chạy môi trường HTTPS local và hướng dẫn cấu hình SSH Key truy cập kho mã nguồn GitLab công ty.',
    specs: {
      'Công nghệ': 'Internal Root CA • TLS 1.3 • SSH Ed25519',
      'Đối tượng': 'Toàn bộ kỹ sư phần mềm & QA',
      'Bàn giao': 'Tệp chứng chỉ kèm hướng dẫn qua RAM'
    }
  },
  {
    id: 'doc-audit-04',
    name: 'Báo Cáo Đánh Giá Bảo Mật & Checklist Vá Lỗi Q4',
    category: 'audit',
    badge: 'Kiểm Toán IT',
    icon: '📑',
    securityLevel: 'Mật • Ban Giám Đốc',
    currency: 'Trang',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 24,
    currentBidXMR: 48,
    buyNowPrice: 48,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'NV-Audit-01',
    bids: [],
    auctionEndTime: Date.now() + (9000 * 1000),
    priceXMR: '48 Trang',
    rawPriceXMR: 48,
    approxUSD: 'Tài liệu nội bộ',
    stock: '2 bản chia sẻ kín',
    desc: 'Báo cáo kiểm thử xâm nhập định kỳ quý 4 và danh sách các hạng mục cần tối ưu bảo mật cho ứng dụng web và API nội bộ.',
    specs: {
      'Định dạng': 'PDF mã hóa AES-256-GCM',
      'Nội dung': 'Báo cáo 48 trang & Danh sách đầu việc vá lỗi',
      'Bàn giao': 'Liên kết giải mã RAM một lần'
    }
  },
  {
    id: 'os-amnesic-05',
    name: 'Bộ Cài Đặt Môi Trường Dev & Docker Registry Nội Bộ',
    category: 'crypto',
    badge: 'Kỹ Thuật',
    icon: '🐳',
    securityLevel: 'Internal Registry',
    currency: 'Image',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 4,
    currentBidXMR: 6,
    buyNowPrice: 6,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'NV-BE-12',
    bids: [],
    auctionEndTime: Date.now() + (12600 * 1000),
    priceXMR: '6 Image',
    rawPriceXMR: 6,
    approxUSD: 'v2.4 Production',
    stock: 'Sẵn sàng sử dụng',
    desc: 'Bộ Docker Image chuẩn và script thiết lập máy trạm tự động cho các dự án Node.js, Redis và Postgres của công ty.',
    specs: {
      'Phiên bản': 'Docker Compose v2.4 • Node 24 LTS',
      'Xác thực': 'Checksum SHA-256 nội bộ',
      'Bàn giao': 'Token đăng nhập Registry qua RAM'
    }
  },
  {
    id: 'key-pgp-06',
    name: 'Bộ API Key Thanh Toán & Chứng Thư Ký Hợp Đồng Số',
    category: 'crypto',
    badge: 'Tài Chính / API',
    icon: '🗝️',
    securityLevel: 'RAM-Only • Hạn chế',
    currency: 'Bộ',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 1,
    currentBidXMR: 2,
    buyNowPrice: 2,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'NV-Fin-05',
    bids: [],
    auctionEndTime: Date.now() + (16200 * 1000),
    priceXMR: '2 Bộ',
    rawPriceXMR: 2,
    approxUSD: 'Kế toán & Pháp chế',
    stock: 'Cần xác nhận trưởng nhóm',
    desc: 'Thông tin khóa API kết nối cổng thanh toán đối tác và chứng thư số ký hợp đồng điện tử, truyền tải tuyệt đối bảo mật không lưu log.',
    specs: {
      'Bảo mật': 'Mã hóa đầu cuối AES-256-GCM',
      'Phân quyền': 'Phòng Tài chính & Nhóm Tích hợp',
      'Bàn giao': 'Mã Drop tự hủy sau khi người nhận mở'
    }
  }
];

let inMemoryBazaarProducts = JSON.parse(JSON.stringify(INITIAL_BAZAAR_PRODUCTS));

export function getBazaarItems() {
  return inMemoryBazaarProducts;
}

export function addBazaarItem(item) {
  if (!item || !item.name) {
    throw new Error('Invalid product item');
  }
  if (item.id && inMemorySoldOrRevokedIds.has(item.id)) {
    return item;
  }
  const existingIdx = inMemoryBazaarProducts.findIndex(p => p.id === item.id);
  if (existingIdx !== -1) {
    inMemoryBazaarProducts[existingIdx] = item;
    return item;
  }
  inMemoryBazaarProducts.unshift(item);
  if (inMemoryBazaarProducts.length > 200) {
    inMemoryBazaarProducts.pop();
  }
  return item;
}

export function bidBazaarItem(id, { bidder, amount, currency = 'XMR' }) {
  const prod = inMemoryBazaarProducts.find(p => p.id === id);
  if (!prod) return null;
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return null;

  prod.isAuction = true;
  prod.bidCount = (prod.bidCount || 0) + 1;
  const current = Number(prod.currentBidXMR || prod.startingBidXMR || prod.rawPriceXMR || 0);

  if (numAmount >= current) {
    prod.currentBidXMR = numAmount;
    prod.rawPriceXMR = numAmount;
    prod.highestBidder = bidder || 'Ghost-Anonymous';
    prod.priceXMR = `${numAmount >= 100 ? numAmount.toLocaleString('en-US', { maximumFractionDigits: 2 }) : numAmount.toFixed(2)} ${currency}`;
  }

  if (!prod.bids) prod.bids = [];
  prod.bids.unshift({
    bidder: bidder || 'Ghost-Anonymous',
    amount: numAmount,
    currency,
    time: 'Vừa xong',
    timestamp: Date.now()
  });

  return prod;
}

export function revokeBazaarItem(id, vendorKillToken) {
  const idx = inMemoryBazaarProducts.findIndex(p => p.id === id);
  if (idx === -1) return { found: false };
  const prod = inMemoryBazaarProducts[idx];
  if (prod.vendorKillToken && prod.vendorKillToken !== vendorKillToken) {
    return { found: true, authorized: false };
  }
  inMemoryBazaarProducts.splice(idx, 1);
  inMemorySoldOrRevokedIds.add(id);
  return { found: true, authorized: true, product: prod };
}

// Volatile In-Memory Blind Deal & Auto-Chat Relay Session (Zero-Log IP & Blinded IDs)
const inMemorySoldOrRevokedIds = new Set();
const inMemoryActiveDeals = new Map();
let inMemoryActiveDeal = null;
let lastBurnedDealId = null;
let lastSoldProductId = null;
let dealBurnTimeout = null;

function markProductSoldAndRemoveFromRAM(productId, productName) {
  let idx = -1;
  if (productId && productId !== 'general' && productId !== 'custom') {
    idx = inMemoryBazaarProducts.findIndex(p => p.id === productId);
  }
  if (idx === -1 && productName) {
    idx = inMemoryBazaarProducts.findIndex(p => p.name === productName);
  }
  if (idx !== -1) {
    const removed = inMemoryBazaarProducts.splice(idx, 1)[0];
    if (removed && removed.id) {
      inMemorySoldOrRevokedIds.add(removed.id);
      lastSoldProductId = removed.id;
      return removed.id;
    }
  } else if (productId && productId !== 'general' && productId !== 'custom') {
    inMemorySoldOrRevokedIds.add(productId);
    lastSoldProductId = productId;
    return productId;
  }
  return null;
}
function initDealStub() {
}

/**
 * Securely overwrites Buffer memory with zeros before release.
 * @param {Buffer} buf 
 */
function wipeBuffer(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

/**
 * Periodically sweeps and evicts expired drops.
 */
function sweepExpiredDrops() {
  const now = Date.now();
  for (const [id, drop] of inMemoryStore.entries()) {
    if (now >= drop.expiresAt) {
      currentTotalRAMBytes -= drop.size;
      wipeBuffer(drop.ciphertextBuffer);
      inMemoryStore.delete(id);
    }
  }
}
const sweeperTimer = setInterval(sweepExpiredDrops, SWEEP_INTERVAL_MS);
sweeperTimer.unref(); // Allow clean process exit on SIGTERM/SIGINT

/**
 * Store drop in volatile RAM
 */
export function storeDrop({ id, ciphertextBuffer, burnAfterReading = true, ttlSeconds = DEFAULT_TTL_SECONDS }) {
  if (!id || !Buffer.isBuffer(ciphertextBuffer) || ciphertextBuffer.length === 0) {
    throw new Error('Invalid drop parameters');
  }

  if (ciphertextBuffer.length > MAX_PAYLOAD_SIZE) {
    throw new Error(`Payload exceeds maximum allowed size of ${MAX_PAYLOAD_SIZE} bytes`);
  }

  if (currentTotalRAMBytes + ciphertextBuffer.length > MAX_TOTAL_RAM_BYTES) {
    throw new Error('Memory capacity reached. Ephemeral drop rejected.');
  }

  const validTTL = Math.min(Math.max(parseInt(ttlSeconds, 10) || DEFAULT_TTL_SECONDS, 60), MAX_TTL_SECONDS);
  const expiresAt = Date.now() + (validTTL * 1000);

  // If ID already exists, wipe previous buffer
  if (inMemoryStore.has(id)) {
    const prev = inMemoryStore.get(id);
    currentTotalRAMBytes -= prev.size;
    wipeBuffer(prev.ciphertextBuffer);
    inMemoryStore.delete(id);
  }

  const drop = {
    id,
    ciphertextBuffer,
    burnAfterReading: Boolean(burnAfterReading),
    expiresAt,
    size: ciphertextBuffer.length
  };

  inMemoryStore.set(id, drop);
  currentTotalRAMBytes += drop.size;
  return { id, expiresAt, burnAfterReading: drop.burnAfterReading };
}

/**
 * Retrieve drop and atomically evict if burn-after-reading is requested.
 */
export function retrieveDrop(id) {
  if (!inMemoryStore.has(id)) {
    return null;
  }

  const drop = inMemoryStore.get(id);

  // Check TTL
  if (Date.now() >= drop.expiresAt) {
    currentTotalRAMBytes -= drop.size;
    wipeBuffer(drop.ciphertextBuffer);
    inMemoryStore.delete(id);
    return null;
  }

  // Clone buffer so client receives it, then handle burn
  const resultBuffer = Buffer.from(drop.ciphertextBuffer);

  if (drop.burnAfterReading) {
    currentTotalRAMBytes -= drop.size;
    wipeBuffer(drop.ciphertextBuffer);
    inMemoryStore.delete(id);
  }

  return resultBuffer;
}

/**
 * Ephemeral P2P Signal Store (RAM-only for ECDH handshakes, expires in 10 minutes)
 * Key: roomId -> Array of signals [{ senderId, payload, timestamp }]
 */
const p2pSignalStore = new Map();

function cleanP2PSignals() {
  const cutoff = Date.now() - (10 * 60 * 1000);
  for (const [roomId, signals] of p2pSignalStore.entries()) {
    const filtered = signals.filter(s => s.timestamp > cutoff);
    if (filtered.length === 0) {
      p2pSignalStore.delete(roomId);
    } else {
      p2pSignalStore.set(roomId, filtered);
    }
  }
}
setInterval(cleanP2PSignals, 30000).unref();

/**
 * Camouflage Decoy Dictionary Data (Multilingual: VI, EN, JA, FR, TECH)
 */
const DECOY_DICTIONARY = [
  {
    word: "Mật mã học",
    lang: "vi",
    phonetic: "/mət˦ˀ˥ maː˦ˀ˥ hawk͡p̚˧˨/",
    pos: "Danh từ",
    definition: "Ngành khoa học nghiên cứu các kỹ thuật bảo mật thông tin, che giấu dữ liệu và xác thực nguồn gốc thông qua các thuật toán toán học.",
    translations: { en: "Cryptography", fr: "Cryptographie", ja: "暗号学 (Angōgaku)" },
    examples: ["Mật mã học hiện đại phụ thuộc nhiều vào lý thuyết số và độ phức tạp tính toán."]
  },
  {
    word: "Zero-Knowledge",
    lang: "en",
    phonetic: "/ˈzɪərəʊ ˈnɒlɪdʒ/",
    pos: "Thuật ngữ Kỹ thuật",
    definition: "Nguyên lý kiến trúc trong đó một bên chứng minh với bên khác rằng một mệnh đề là đúng mà không tiết lộ bất kỳ thông tin nào ngoài tính đúng đắn của mệnh đề.",
    translations: { vi: "Không tiết lộ tri thức", fr: "Preuve à divulgation nulle de connaissance", ja: "ゼロ知識証明" },
    examples: ["Zero-knowledge architecture guarantees that server operators cannot access customer plaintext data."]
  },
  {
    word: "Tính chất tạm thời (Ephemeral)",
    lang: "vi",
    phonetic: "/tïŋ˧˦ cət˦˥ taːm˧˨ tʰəːj˨˩/",
    pos: "Tính từ",
    definition: "Đặc tính chỉ tồn tại trong thời gian ngắn ngủi, không lưu vết vĩnh viễn trên bất kỳ phương tiện lưu trữ thứ cấp nào.",
    translations: { en: "Ephemeral", fr: "Éphémère", ja: "儚い / 一時的な" },
    examples: ["Khóa trao đổi ECDH có tính chất ephemeral giúp bảo đảm tính bí mật chuyển tiếp hoàn hảo (PFS)."]
  },
  {
    word: "Bộ nhớ khả biến (RAM)",
    lang: "vi",
    phonetic: "/ɓo˧˨ ɲəː˧˦ xaː˧˩ ɓiən˧˦/",
    pos: "Danh từ",
    definition: "Bộ nhớ truy cập ngẫu nhiên của máy tính, mất toàn bộ dữ liệu ngay khi ngắt nguồn điện.",
    translations: { en: "Random Access Memory", fr: "Mémoire vive", ja: "ランダムアクセスメモリ" },
    examples: ["Dữ liệu chỉ tồn tại trên RAM nhằm triệt tiêu hoàn toàn dấu vết lưu trữ trên đĩa cứng."]
  },
  {
    word: "Entropie",
    lang: "fr",
    phonetic: "/ɑ̃.tʁɔ.pi/",
    pos: "Danh từ",
    definition: "Độ hỗn loạn hoặc mức độ không thể dự đoán của một nguồn dữ liệu, là nền tảng cho việc sinh số ngẫu nhiên mật mã học an toàn.",
    translations: { vi: "Entropy", en: "Entropy", ja: "エントロピー" },
    examples: ["Un générateur de nombres aléatoires cryptographiques nécessite une haute entropie."]
  },
  {
    word: "プライバシー (Privacy)",
    lang: "ja",
    phonetic: "/pu-ra-i-ba-sī/",
    pos: "Danh từ",
    definition: "Quyền riêng tư cá nhân và quyền kiểm soát đối với thông tin nhạy cảm của chính mình.",
    translations: { vi: "Quyền riêng tư", en: "Privacy", fr: "Vie privée" },
    examples: ["個人のプライバシーを保護することは、デジタル社会における基本的人権である。"]
  },
  {
    word: "Diffie-Hellman",
    lang: "tech",
    phonetic: "/ˈdɪfi ˈhɛlmən/",
    pos: "Giao thức",
    definition: "Phương pháp toán học cho phép hai bên trao đổi một bí mật chung qua một kênh truyền thông không bảo mật mà không để lộ bí mật đó cho kẻ nghe lén.",
    translations: { vi: "Giao thức trao đổi khóa Diffie-Hellman", fr: "Échange de clés Diffie-Hellman", ja: "ディフィー・ヘルマン鍵共有" },
    examples: ["ECDH sử dụng đường cong elliptic P-256 cho tốc độ tính toán cao và kích thước khóa gọn nhẹ."]
  },
  {
    word: "Ẩn mã (Steganography)",
    lang: "vi",
    phonetic: "/ən˧˩ maː˦ˀ˥/",
    pos: "Danh từ",
    definition: "Nghệ thuật và khoa học về việc che giấu thông điệp bí mật bên trong một thông điệp hoặc vật mang vô hại khác nhằm che giấu sự tồn tại của việc giao tiếp.",
    translations: { en: "Steganography", fr: "Stéganographie", ja: "ステガノグラフィー" },
    examples: ["Hệ thống ngụy trang giao diện trao đổi bí mật dưới dạng một cuốn từ điển đa ngôn ngữ trực tuyến."]
  }
];

/**
 * MIME Type Lookup Helper
 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * Standard Security Headers applied to EVERY response.
 * Completely disables caching, suppresses identifying fingerprints, enforces strict CSP.
 */
function applySecurityHeaders(res) {
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'LexiconServer/2.4'); // Camouflaged benign server header
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://upload.wikimedia.org https://*.wikipedia.org; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000 https://*.wikipedia.org https://*.peerjs.com wss://*.peerjs.com;"
  );
}

/**
 * Serve static assets from public/ directory
 */
function serveStaticFile(reqPath, res) {
  let cleanPath = reqPath.split('?')[0];
  if (cleanPath === '/' || cleanPath === '') {
    cleanPath = '/index.html';
  } else if (cleanPath === '/vault' || cleanPath === '/drop' || cleanPath === '/secure' || cleanPath === '/market' || cleanPath === '/shop' || cleanPath === '/bazaar') {
    cleanPath = '/vault.html';
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(path.join(__dirname, 'public', cleanPath));
  if (!safePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback for client-side SPA routing (all routes point back to index.html)
        const indexPath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(indexPath, (idxErr, idxData) => {
          if (idxErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            applySecurityHeaders(res);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(idxData);
          }
        });
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    applySecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/**
 * Read request body safely with strict byte limit
 */
function readRequestBody(req, maxBytes = MAX_PAYLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    let bytesReceived = 0;
    const chunks = [];

    req.on('data', chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        req.destroy();
        reject(new Error('Payload entity too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Core HTTP Request Handler (ZERO-LOG: Does NOT log client IP, paths, or headers)
 */
export function createServer() {
  return http.createServer(async (req, res) => {
    // Zero-Log: Deliberately NO console.log(req.ip, req.headers, req.url)
    applySecurityHeaders(res);

    const clientKey = req.socket.remoteAddress || '127.0.0.1';
    if (!checkRateLimit(clientKey)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // -------------------------------------------------------------
      // 1. DECOY API ENDPOINTS: Multilingual Dictionary Search
      // -------------------------------------------------------------
      if (pathname === '/api/lexicon/query' && method === 'GET') {
        const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const lang = parsedUrl.searchParams.get('lang') || 'all';

        let results = DECOY_DICTIONARY;
        if (lang !== 'all') {
          results = results.filter(item => item.lang === lang);
        }
        if (query) {
          results = results.filter(item => 
            item.word.toLowerCase().includes(query) || 
            item.definition.toLowerCase().includes(query) ||
            Object.values(item.translations).some(t => t.toLowerCase().includes(query))
          );
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', count: results.length, data: results }));
        return;
      }

      if (pathname === '/api/lexicon/languages' && method === 'GET') {
        const languages = [
          { code: 'all', name: 'Tất cả ngôn ngữ' },
          { code: 'vi', name: 'Tiếng Việt' },
          { code: 'en', name: 'English' },
          { code: 'fr', name: 'Français' },
          { code: 'ja', name: '日本語' },
          { code: 'tech', name: 'Thuật ngữ Kỹ thuật' }
        ];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', languages }));
        return;
      }

      // Wikipedia Live Knowledge Integration Endpoint
      if (pathname === '/api/lexicon/wiki-summary' && method === 'GET') {
        const term = (parsedUrl.searchParams.get('q') || '').trim();
        const lang = (parsedUrl.searchParams.get('lang') || 'vi').toLowerCase();

        if (!term) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing search term' }));
          return;
        }

        const wikiDomain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
        const wikiApiUrl = `https://${wikiDomain}/api/rest_v1/page/summary/${encodeURIComponent(term)}`;

        try {
          const wikiResponse = await fetch(wikiApiUrl, {
            headers: {
              'User-Agent': 'MultilingualLexiconApp/2.4 (Educational Reference Tool)'
            }
          });

          if (!wikiResponse.ok) {
            res.writeHead(wikiResponse.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'not_found', error: 'No Wikipedia article found' }));
            return;
          }

          const wikiData = await wikiResponse.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            title: wikiData.title,
            extract: wikiData.extract,
            description: wikiData.description,
            thumbnail: wikiData.thumbnail ? wikiData.thumbnail.source : null,
            articleUrl: wikiData.content_urls ? wikiData.content_urls.desktop.page : `https://${wikiDomain}/wiki/${encodeURIComponent(term)}`,
            lang
          }));
        } catch (fetchErr) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unable to reach Wikipedia service' }));
        }
        return;
      }

      // Wikipedia Live OpenSearch Suggestions Endpoint
      if (pathname === '/api/lexicon/opensearch' && method === 'GET') {
        const term = (parsedUrl.searchParams.get('q') || '').trim();
        const lang = (parsedUrl.searchParams.get('lang') || 'vi').toLowerCase();

        if (!term) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
          return;
        }

        const wikiDomain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
        const openSearchUrl = `https://${wikiDomain}/w/api.php?action=opensearch&format=json&search=${encodeURIComponent(term)}&limit=8`;

        try {
          const wikiResponse = await fetch(openSearchUrl, {
            headers: {
              'User-Agent': 'MultilingualLexiconApp/2.4 (Educational Reference Tool)'
            }
          });

          if (!wikiResponse.ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
          }

          const openSearchData = await wikiResponse.json();
          // openSearchData format: [query, [titles], [descriptions], [urls]]
          const titles = openSearchData[1] || [];
          const urls = openSearchData[3] || [];

          const suggestions = titles.map((title, idx) => ({
            title,
            url: urls[idx] || `https://${wikiDomain}/wiki/${encodeURIComponent(title)}`,
            lang
          }));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', suggestions }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', suggestions: [] }));
        }
        return;
      }

      // -------------------------------------------------------------
      // 2. COVERT DROP API: Disguised as Lexicon Cache / Sync
      // -------------------------------------------------------------
      
      // CREATE DROP: POST /api/lexicon/cache-entry or /api/v1/drop
      if ((pathname === '/api/lexicon/cache-entry' || pathname === '/api/v1/drop') && method === 'POST') {
        const rawBody = await readRequestBody(req, MAX_PAYLOAD_SIZE);
        
        let payload;
        try {
          payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          return;
        }

        const { ciphertext, burnAfterReading = true, ttl = DEFAULT_TTL_SECONDS } = payload;
        if (!ciphertext || typeof ciphertext !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ciphertext string' }));
          return;
        }

        // Generate 128-bit cryptographically secure drop ID (32 hex chars)
        const dropId = crypto.randomBytes(16).toString('hex');
        const ciphertextBuffer = Buffer.from(ciphertext, 'utf8');

        const dropInfo = storeDrop({
          id: dropId,
          ciphertextBuffer,
          burnAfterReading,
          ttlSeconds: ttl
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          id: dropInfo.id,
          expiresAt: dropInfo.expiresAt,
          burnAfterReading: dropInfo.burnAfterReading
        }));
        return;
      }

      // RETRIEVE DROP: GET /api/lexicon/cache-entry/:id or /api/v1/drop/:id
      const dropMatch = pathname.match(/^\/(?:api\/lexicon\/cache-entry|api\/v1\/drop)\/([a-f0-9]{32})$/);
      if (dropMatch && method === 'GET') {
        const dropId = dropMatch[1];
        const cipherBuffer = retrieveDrop(dropId);

        if (!cipherBuffer) {
          // Uniform 404 response (prevents distinguishing between non-existent and already-burned)
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Entry not found or already purged' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          ciphertext: cipherBuffer.toString('utf8')
        }));
        return;
      }

      // -------------------------------------------------------------
      // 3. EPHEMERAL P2P SIGNALING: For Anonymous Ephemeral ECDH Handshake
      // -------------------------------------------------------------
      if (pathname === '/api/lexicon/p2p-signal' && method === 'POST') {
        const rawBody = await readRequestBody(req, 64 * 1024); // max 64KB for signaling
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signal payload' }));
          return;
        }

        const { channelId, senderId, signal } = body;
        if (!channelId || !senderId || !signal) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing channelId, senderId, or signal' }));
          return;
        }

        if (!p2pSignalStore.has(channelId)) {
          p2pSignalStore.set(channelId, []);
        }
        const signals = p2pSignalStore.get(channelId);
        signals.push({ senderId, signal, timestamp: Date.now() });

        // Cap signals per channel
        if (signals.length > 20) signals.shift();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'delivered' }));
        return;
      }

      if (pathname.startsWith('/api/lexicon/p2p-signal/') && method === 'GET') {
        const channelId = pathname.replace('/api/lexicon/p2p-signal/', '');
        const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);
        const senderId = parsedUrl.searchParams.get('senderId') || '';

        const signals = p2pSignalStore.get(channelId) || [];
        // Filter out signals from same sender and older than 'since'
        const incoming = signals.filter(s => s.senderId !== senderId && s.timestamp > since);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ signals: incoming, now: Date.now() }));
        return;
      }

      // -------------------------------------------------------------
      // 4. BAZAAR REGISTRY API: Synchronized Ephemeral RAM Marketplace
      // -------------------------------------------------------------

      // LIST ITEMS: GET /api/lexicon/bazaar-items or /api/bazaar/items
      if ((pathname === '/api/lexicon/bazaar-items' || pathname === '/api/bazaar/items') && method === 'GET') {
        const items = getBazaarItems();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', count: items.length, data: items, soldOrRevokedIds: Array.from(inMemorySoldOrRevokedIds) }));
        return;
      }

      // PUBLISH NEW ITEM: POST /api/lexicon/bazaar-items or /api/bazaar/items
      if ((pathname === '/api/lexicon/bazaar-items' || pathname === '/api/bazaar/items') && method === 'POST') {
        const rawBody = await readRequestBody(req, 128 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          return;
        }

        if (!body.name || typeof body.name !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing product name' }));
          return;
        }

        const randHex = crypto.randomBytes(4).toString('hex').toUpperCase();
        const id = body.id || `usr-${body.category || 'item'}-${randHex}`;
        const killTokenHex = crypto.randomBytes(6).toString('hex').toUpperCase();
        const vendorKillToken = body.vendorKillToken || `KILL-${killTokenHex}`;

        const newProduct = {
          id,
          name: String(body.name).trim(),
          category: body.category || 'physical',
          badge: body.badge || 'Nội Bộ Công Ty',
          icon: body.icon || '💎',
          securityLevel: body.securityLevel || 'Phối Hợp Nội Bộ',
          currency: body.currency || 'XMR',
          isAuction: body.isAuction !== false,
          allowBid: body.allowBid !== false,
          allowBuyNow: body.allowBuyNow !== false,
          startingBidXMR: Number(body.startingBidXMR || body.priceXMR || 0.1),
          currentBidXMR: Number(body.currentBidXMR || body.startingBidXMR || body.priceXMR || 0.1),
          buyNowPrice: Number(body.buyNowPrice || body.priceXMR || 1.0),
          minBidIncrement: Number(body.minBidIncrement || 0),
          bidCount: Number(body.bidCount || 0),
          highestBidder: body.highestBidder || 'Chưa phân công',
          bids: Array.isArray(body.bids) ? body.bids : [],
          auctionEndTime: body.auctionEndTime !== undefined ? Number(body.auctionEndTime) : 0,
          priceXMR: body.priceXMR || `${Number(body.currentBidXMR || body.startingBidXMR || 0.1).toFixed(2)} ${body.currency || 'XMR'}`,
          rawPriceXMR: Number(body.rawPriceXMR || body.currentBidXMR || 0.1),
          approxUSD: body.approxUSD || 'Nội bộ công ty',
          stock: body.stock || 'Sẵn sàng phối hợp',
          desc: body.desc || '',
          specs: typeof body.specs === 'object' && body.specs !== null ? body.specs : {},
          vendorKillToken,
          isUserCreated: true,
          createdAt: Date.now()
        };

        addBazaarItem(newProduct);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', product: newProduct }));
        return;
      }

      // SUBMIT BID: POST /api/lexicon/bazaar-items/:id/bid or /api/bazaar/items/:id/bid
      const bidMatch = pathname.match(/^\/(?:api\/lexicon\/bazaar-items|api\/bazaar\/items)\/([^/]+)\/bid$/);
      if (bidMatch && method === 'POST') {
        const itemId = decodeURIComponent(bidMatch[1]);
        const rawBody = await readRequestBody(req, 16 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid bid payload' }));
          return;
        }

        const updated = bidBazaarItem(itemId, {
          bidder: body.bidder,
          amount: body.amount,
          currency: body.currency
        });

        if (!updated) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Item not found or invalid bid amount' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', product: updated }));
        return;
      }

      // REVOKE ITEM: POST /api/lexicon/bazaar-items/:id/revoke or /api/bazaar/items/:id/revoke
      const revokeMatch = pathname.match(/^\/(?:api\/lexicon\/bazaar-items|api\/bazaar\/items)\/([^/]+)\/revoke$/);
      if (revokeMatch && method === 'POST') {
        const itemId = decodeURIComponent(revokeMatch[1]);
        const rawBody = await readRequestBody(req, 16 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid revoke payload' }));
          return;
        }

        const result = revokeBazaarItem(itemId, body.vendorKillToken);
        if (!result.found) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Item not found' }));
          return;
        }
        if (!result.authorized) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid Vendor Kill Token' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Item revoked successfully from RAM' }));
        return;
      }

      // -------------------------------------------------------------
      // MULTI-BUYER BLIND DEAL & EPHEMERAL RELAY: GET / POST /api/lexicon/bazaar-deals
      if ((pathname === '/api/lexicon/bazaar-deals' || pathname === '/api/bazaar/deals') && method === 'GET') {
        const queryDealId = parsedUrl.searchParams ? parsedUrl.searchParams.get('dealId') : null;
        const activeList = Array.from(inMemoryActiveDeals.values()).filter(d => d.status !== 'completed_burned');
        
        let targetDeal = null;
        if (queryDealId && inMemoryActiveDeals.has(queryDealId)) {
          const d = inMemoryActiveDeals.get(queryDealId);
          if (d.status !== 'completed_burned') targetDeal = d;
        } else if (inMemoryActiveDeal && inMemoryActiveDeal.status !== 'completed_burned') {
          targetDeal = inMemoryActiveDeal;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          deal: targetDeal,
          deals: activeList,
          lastBurnedDealId,
          lastSoldProductId,
          soldOrRevokedIds: Array.from(inMemorySoldOrRevokedIds)
        }));
        return;
      }

      if ((pathname === '/api/lexicon/bazaar-deals' || pathname === '/api/bazaar/deals') && method === 'POST') {
        const rawBody = await readRequestBody(req, 64 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid deal payload' }));
          return;
        }

        const action = body.action || 'init';

        if (action === 'init') {
          const randCode = crypto.randomBytes(2).toString('hex').toUpperCase();
          const dealId = body.dealId || `DEAL-${randCode}`;
          const buyerToken = crypto.randomBytes(2).toString('hex').toUpperCase();
          const sellerToken = crypto.randomBytes(2).toString('hex').toUpperCase();

          // Reuse active deal if exact same dealId provided
          if (inMemoryActiveDeals.has(dealId)) {
            const existing = inMemoryActiveDeals.get(dealId);
            if (existing && existing.status !== 'completed_burned') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'success', deal: existing, deals: Array.from(inMemoryActiveDeals.values()) }));
              return;
            }
          }

          const newDeal = {
            dealId,
            productId: body.productId || 'general',
            productName: body.productName || 'Trao đổi Công việc Nội bộ',
            priceXMR: body.priceXMR || 'Nội bộ',
            initiatorAlias: body.initiatorAlias || '',
            buyerBlindId: `ID-Mua #${buyerToken}`,
            sellerBlindId: `ID-Bán #${sellerToken}`,
            status: 'connected',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              {
                id: `sys-${Date.now()}`,
                role: 'system',
                author: 'HỆ THỐNG KẾT NỐI NỘI BỘ (E2EE RAM)',
                time: body.time || 'Vừa xong',
                text: `🔗 Đã mở kênh trao đổi nội bộ [${dealId}] (Mã hóa RAM, tự hủy khi hoàn tất bàn giao)`
              }
            ]
          };

          inMemoryActiveDeals.set(dealId, newDeal);
          inMemoryActiveDeal = newDeal;

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', deal: newDeal, deals: Array.from(inMemoryActiveDeals.values()) }));
          return;
        }

        if (action === 'message') {
          const reqDealId = body.dealId || inMemoryActiveDeal?.dealId;
          let deal = reqDealId ? inMemoryActiveDeals.get(reqDealId) : inMemoryActiveDeal;

          if (!deal || deal.status === 'completed_burned') {
            const randCode = crypto.randomBytes(2).toString('hex').toUpperCase();
            const buyerToken = crypto.randomBytes(2).toString('hex').toUpperCase();
            const sellerToken = crypto.randomBytes(2).toString('hex').toUpperCase();
            const dealId = reqDealId || `DEAL-${randCode}`;
            deal = {
              dealId,
              productId: body.productId || 'general',
              productName: body.productName || 'Trao đổi Nội bộ',
              priceXMR: body.priceXMR || '',
              initiatorAlias: body.senderAlias || '',
              buyerBlindId: `ID-Mua #${buyerToken}`,
              sellerBlindId: `ID-Bán #${sellerToken}`,
              status: 'connected',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messages: []
            };
            inMemoryActiveDeals.set(dealId, deal);
            inMemoryActiveDeal = deal;
          }

          const senderRole = body.senderRole === 'seller'
            ? 'seller'
            : (body.senderRole === 'buyer' ? 'buyer' : ((body.senderAlias && body.senderAlias === deal.initiatorAlias) ? 'buyer' : 'seller'));
          const blindDisplay = senderRole === 'seller'
            ? deal.sellerBlindId
            : deal.buyerBlindId;

          const newMsg = {
            id: body.id || `msg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            role: senderRole,
            senderBlindId: blindDisplay,
            senderAlias: body.senderAlias || '',
            blindAuthor: blindDisplay,
            text: String(body.text || '').trim().slice(0, 2000),
            time: body.time || 'Vừa xong',
            timestamp: Date.now()
          };

          if (newMsg.text) {
            deal.messages.push(newMsg);
            if (deal.messages.length > 100) {
              deal.messages.shift();
            }
            deal.updatedAt = Date.now();
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', deal, deals: Array.from(inMemoryActiveDeals.values()) }));
          return;
        }

        if (action === 'pay_escrow') {
          const reqDealId = body.dealId || inMemoryActiveDeal?.dealId;
          const deal = reqDealId ? inMemoryActiveDeals.get(reqDealId) : inMemoryActiveDeal;
          const soldProductId = markProductSoldAndRemoveFromRAM(
            body.productId || deal?.productId,
            body.productName || deal?.productName
          );

          if (deal && deal.status !== 'completed_burned') {
            deal.status = 'paid_escrow';
            deal.orderId = body.orderId || deal.orderId || '';
            deal.soldProductId = soldProductId || deal.productId || '';
            deal.updatedAt = Date.now();
            deal.messages.push({
              id: `sys-pay-${Date.now()}`,
              role: 'system',
              author: 'BÀN GIAO TÀI NGUYÊN (RAM)',
              time: body.time || 'Vừa xong',
              text: `📥 Thành viên tiếp nhận đã xác nhận phiếu bàn giao ${body.orderId ? `[${body.orderId}]` : ''}. Hạng mục "${deal.productName}" đã chuyển sang trạng thái đang xử lý! Sau khi bàn giao xong, bấm "✅ Hoàn Tất Bàn Giao (Tự Hủy Chat)" để xóa lịch sử khỏi RAM.`
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            deal,
            soldProductId,
            soldOrRevokedIds: Array.from(inMemorySoldOrRevokedIds),
            deals: Array.from(inMemoryActiveDeals.values())
          }));
          return;
        }

        if (action === 'complete_and_burn') {
          const burnedDealId = body.dealId || (inMemoryActiveDeal ? inMemoryActiveDeal.dealId : 'DEAL');
          const existingDeal = inMemoryActiveDeals.get(burnedDealId) || inMemoryActiveDeal;
          const soldProductId = markProductSoldAndRemoveFromRAM(
            body.productId || existingDeal?.productId,
            body.productName || existingDeal?.productName
          );

          lastBurnedDealId = burnedDealId;
          const burnedDeal = {
            dealId: burnedDealId,
            productId: soldProductId || existingDeal?.productId || '',
            status: 'completed_burned',
            burnedAt: Date.now(),
            messages: []
          };
          inMemoryActiveDeals.set(burnedDealId, burnedDeal);
          if (inMemoryActiveDeal && inMemoryActiveDeal.dealId === burnedDealId) {
            inMemoryActiveDeal = null;
          }
          if (dealBurnTimeout) clearTimeout(dealBurnTimeout);
          dealBurnTimeout = setTimeout(() => {
            inMemoryActiveDeals.delete(burnedDealId);
          }, 5000);
          if (dealBurnTimeout.unref) dealBurnTimeout.unref();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            deal: null,
            burnedDealId,
            lastBurnedDealId,
            soldProductId,
            soldOrRevokedIds: Array.from(inMemorySoldOrRevokedIds)
          }));
          return;
        }
      }

      // 5. STATIC DECOY WEB APP: Multilingual Dictionary UI
      // -------------------------------------------------------------
      if (method === 'GET' || method === 'HEAD') {
        serveStaticFile(pathname, res);
        return;
      }

      // Method Not Allowed
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');

    } catch (err) {
      // Never expose stack trace or internal details to client
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'System error' }));
      }
    }
  });
}

// Auto-start when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    // Intentionally minimalistic initialization message (No telemetry / No sensitive info)
    process.stdout.write(`[System Ready] Ephemeral RAM Lexicon Service active on http://${HOST}:${PORT}\n`);
  });

  // Graceful shutdown with RAM purge
  const cleanExit = () => {
    for (const [, drop] of inMemoryStore) {
      wipeBuffer(drop.ciphertextBuffer);
    }
    inMemoryStore.clear();
    p2pSignalStore.clear();
    process.exit(0);
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}
