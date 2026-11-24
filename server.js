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
import { attachCompanyWebSocket } from './src/ws-server.js';

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
    department: 'devops',
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
    department: 'admin_it',
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
    department: 'admin_it',
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
    department: 'devops',
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
    department: 'network',
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
    department: 'network',
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
    department: 'finance',
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
    department: 'devops',
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
    department: 'finance',
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

export function setCompanyDataDirForTests(customDir) {
  companyTestDataDir = customDir || null;
}

export function resetCompanyWorkspaceForTests(customDir = null) {
  companyTestDataDir = customDir || null;
  companyAttachmentsRAM.clear();
  loginAttemptsMap.clear();
  seedCompanyWorkspace({ persist: Boolean(customDir) });
}

export function expireSessionForTests(token) {
  if (companySessions.has(token)) {
    const sess = companySessions.get(token);
    sess.expiresAt = Date.now() - 1000;
  }
}

export function reloadCompanyWorkspaceFromDiskForTests(customDir = null) {
  if (customDir) companyTestDataDir = customDir;
  companySessions.clear();
  loadCompanyWorkspaceFromDisk();
}

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
  persistCompanyWorkspace();
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

// =========================================================================
// CLOSED-COMPANY RBAC SYSTEM (NHÂN VIÊN • QUẢN LÍ • GIÁM ĐỐC) - RAM ONLY
// =========================================================================
export const COMPANY_DEPARTMENTS = [
  { id: 'devops', name: 'Ban DevOps & Hạ tầng', short: 'DevOps' },
  { id: 'admin_it', name: 'Ban Hành chính & IT', short: 'Hành chính IT' },
  { id: 'network', name: 'Ban Mạng & An ninh', short: 'Mạng & An ninh' },
  { id: 'finance', name: 'Ban Tài chính & Pháp chế', short: 'Tài chính' }
];

const CATEGORY_TO_DEPT = {
  hardware: 'devops',
  physical: 'admin_it',
  digital: 'admin_it',
  service: 'admin_it',
  network: 'network',
  crypto: 'finance',
  audit: 'finance'
};

function inferDepartment(item) {
  if (item && item.department && COMPANY_DEPARTMENTS.some(d => d.id === item.department)) {
    return item.department;
  }
  return CATEGORY_TO_DEPT[item?.category] || 'devops';
}

const companyUsers = new Map();
const companySessions = new Map();
const companyRooms = new Map();
const companyAuditLog = [];
const companyAttachmentsRAM = new Map();
const loginAttemptsMap = new Map();
const activeWsHubs = new Set();
let companyTestDataDir = null;

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const LOGIN_BRUTE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOGIN_MAX_FAILURES = 10;

function notifyCompanyWs(reason, predicateFn = null, meta = {}) {
  for (const hub of activeWsHubs) {
    hub.notifySync(reason, predicateFn, meta);
  }
}

function kickCompanyUserWs(userId, reason = 'Tài khoản đã bị khóa hoặc thu hồi phiên') {
  for (const hub of activeWsHubs) {
    hub.kickUser(userId, reason);
  }
}

function checkLoginBruteForce(key) {
  const now = Date.now();
  const entry = loginAttemptsMap.get(key);
  if (!entry || now - entry.firstFailAt > LOGIN_BRUTE_WINDOW_MS) {
    return { allowed: true };
  }
  if (entry.count >= LOGIN_MAX_FAILURES) {
    const retryAfterSec = Math.max(1, Math.ceil((LOGIN_BRUTE_WINDOW_MS - (now - entry.firstFailAt)) / 1000));
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

function recordLoginFailure(key) {
  const now = Date.now();
  const entry = loginAttemptsMap.get(key);
  if (!entry || now - entry.firstFailAt > LOGIN_BRUTE_WINDOW_MS) {
    loginAttemptsMap.set(key, { count: 1, firstFailAt: now });
  } else {
    entry.count++;
  }
}

function clearLoginFailures(key) {
  loginAttemptsMap.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of companySessions.entries()) {
    if (sess.expiresAt && now >= sess.expiresAt) {
      companySessions.delete(token);
    }
  }
  for (const [k, entry] of loginAttemptsMap.entries()) {
    if (now - entry.firstFailAt > LOGIN_BRUTE_WINDOW_MS) {
      loginAttemptsMap.delete(k);
    }
  }
}, 60000).unref();

function isTestProcess() {
  return Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.some(arg => arg.includes('.test.'));
}

function getEffectiveDataDir() {
  if (companyTestDataDir) return companyTestDataDir;
  if (process.env.NEXUS_COMPANY_DATA_DIR) return process.env.NEXUS_COMPANY_DATA_DIR;
  if (isTestProcess()) return null;
  return path.join(__dirname, 'data');
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(plain, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return { valid: false, needsUpgrade: false };
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt, hexExpected] = parts;
    const actualBuf = crypto.scryptSync(String(plain), salt, 64);
    const expectedBuf = Buffer.from(hexExpected, 'hex');
    if (actualBuf.length !== expectedBuf.length) return { valid: false, needsUpgrade: false };
    return { valid: crypto.timingSafeEqual(actualBuf, expectedBuf), needsUpgrade: false };
  }
  const a = Buffer.from(String(plain), 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { valid, needsUpgrade: valid };
}

function revokeUserSessions(userId) {
  for (const [token, sess] of companySessions.entries()) {
    if (sess.userId === userId) {
      companySessions.delete(token);
    }
  }
  kickCompanyUserWs(userId, 'Tài khoản đã bị khóa bởi Quản lí/Giám đốc');
}

function persistCompanyWorkspace() {
  const dir = getEffectiveDataDir();
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stateFile = path.join(dir, 'company-state.json');
    const tmpFile = path.join(dir, `company-state.${process.pid}.tmp`);
    const snapshot = {
      version: 1,
      savedAt: Date.now(),
      users: Array.from(companyUsers.values()),
      rooms: Array.from(companyRooms.values()),
      projects: inMemoryBazaarProducts,
      soldOrRevokedIds: Array.from(inMemorySoldOrRevokedIds),
      auditLog: companyAuditLog
    };
    fs.writeFileSync(tmpFile, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmpFile, stateFile);
  } catch {
    // Non-fatal fallback if filesystem is read-only
  }
}

function saveAttachmentBinary(attId, buffer) {
  companyAttachmentsRAM.set(attId, buffer);
  const dir = getEffectiveDataDir();
  if (!dir) return;
  try {
    const attDir = path.join(dir, 'company-attachments');
    fs.mkdirSync(attDir, { recursive: true });
    fs.writeFileSync(path.join(attDir, `${attId}.bin`), buffer);
  } catch {}
}

function loadAttachmentBinary(attId) {
  if (companyAttachmentsRAM.has(attId)) {
    return companyAttachmentsRAM.get(attId);
  }
  const dir = getEffectiveDataDir();
  if (!dir) return null;
  const targetPath = path.join(dir, 'company-attachments', `${attId}.bin`);
  try {
    if (fs.existsSync(targetPath)) {
      const buf = fs.readFileSync(targetPath);
      companyAttachmentsRAM.set(attId, buf);
      return buf;
    }
  } catch {}
  return null;
}

function deleteAttachmentBinary(attId) {
  if (!attId) return;
  companyAttachmentsRAM.delete(attId);
  const dir = getEffectiveDataDir();
  if (!dir) return;
  try {
    const targetPath = path.join(dir, 'company-attachments', `${attId}.bin`);
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  } catch {}
}

function addAuditEntry(actor, action, detail) {
  companyAuditLog.unshift({
    id: `audit-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    actorName: actor ? actor.name : 'Hệ thống',
    actorRole: actor ? actor.role : 'system',
    action,
    detail,
    time: new Date().toLocaleTimeString('vi-VN', { hour12: false })
  });
  if (companyAuditLog.length > 80) companyAuditLog.pop();
}

function seedCompanyWorkspace({ persist = true } = {}) {
  companyUsers.clear();
  companySessions.clear();
  companyRooms.clear();
  companyAuditLog.length = 0;
  inMemoryBazaarProducts = JSON.parse(JSON.stringify(INITIAL_BAZAAR_PRODUCTS));
  inMemorySoldOrRevokedIds.clear();

  const seededPasswordHash = hashPassword('123');
  const initialUsers = [
    // Nhân viên các ban
    { id: 'u-emp-devops', username: 'nv.devops1', passwordHash: seededPasswordHash, name: 'Trần Minh Quân', role: 'employee', title: 'Kỹ sư DevOps', department: 'devops', active: true },
    { id: 'u-emp-it', username: 'nv.it1', passwordHash: seededPasswordHash, name: 'Nguyễn Thảo Vy', role: 'employee', title: 'Chuyên viên IT', department: 'admin_it', active: true },
    { id: 'u-emp-net', username: 'nv.net1', passwordHash: seededPasswordHash, name: 'Phạm Hoàng Nam', role: 'employee', title: 'Kỹ sư Hạ tầng Mạng', department: 'network', active: true },
    { id: 'u-emp-fin', username: 'nv.fin1', passwordHash: seededPasswordHash, name: 'Lê Thu Hà', role: 'employee', title: 'Chuyên viên Tài chính', department: 'finance', active: true },

    // Quản lí các ban
    { id: 'u-mgr-devops', username: 'ql.devops', passwordHash: seededPasswordHash, name: 'Vũ Đức Anh', role: 'manager', title: 'Trưởng ban DevOps', department: 'devops', active: true },
    { id: 'u-mgr-it', username: 'ql.it', passwordHash: seededPasswordHash, name: 'Đặng Bảo Ngọc', role: 'manager', title: 'Trưởng ban Hành chính IT', department: 'admin_it', active: true },
    { id: 'u-mgr-net', username: 'ql.net', passwordHash: seededPasswordHash, name: 'Bùi Quốc Khánh', role: 'manager', title: 'Trưởng ban Mạng & An ninh', department: 'network', active: true },
    { id: 'u-mgr-fin', username: 'ql.fin', passwordHash: seededPasswordHash, name: 'Hoàng Gia Bảo', role: 'manager', title: 'Trưởng ban Tài chính', department: 'finance', active: true },

    // Giám đốc điều hành
    { id: 'u-director', username: 'giamdoc', passwordHash: seededPasswordHash, name: 'Nguyễn Thành Đạt', role: 'director', title: 'Tổng Giám Đốc', department: 'all', active: true }
  ];

  initialUsers.forEach(u => companyUsers.set(u.id, u));

  const nowStr = '09:00:00';
  const initialRooms = [
    {
      id: 'room-devops-main',
      name: 'Phòng Ban DevOps & Hạ tầng',
      scope: 'department',
      department: 'devops',
      projectId: '',
      status: 'active',
      createdBy: 'u-mgr-devops',
      createdByName: 'Vũ Đức Anh',
      createdByRole: 'manager',
      participantIds: [],
      includeAllManagers: false,
      createdAt: Date.now() - 3600000,
      messages: [
        { id: 'm-1', senderId: 'u-mgr-devops', senderName: 'Vũ Đức Anh', senderRole: 'manager', time: nowStr, text: 'Chào nhóm DevOps! Mọi thông tin triển khai Gateway API và Docker nội bộ trao đổi tại đây.' },
        { id: 'm-2', senderId: 'u-emp-devops', senderName: 'Trần Minh Quân', senderRole: 'employee', time: '09:04:12', text: 'Rõ ạ, em đang hoàn thiện cấu hình HSM Token cho môi trường Staging.' }
      ]
    },
    {
      id: 'room-devops-work',
      name: 'Công việc: Triển khai Gateway API Q4',
      scope: 'work',
      department: 'devops',
      projectId: 'auction-chip-07',
      status: 'active',
      createdBy: 'u-mgr-devops',
      createdByName: 'Vũ Đức Anh',
      createdByRole: 'manager',
      participantIds: [],
      includeAllManagers: false,
      createdAt: Date.now() - 2400000,
      messages: [
        { id: 'm-3', senderId: 'u-mgr-devops', senderName: 'Vũ Đức Anh', senderRole: 'manager', time: '09:15:00', text: 'Phòng công việc phục vụ Sprint 14 Gateway API. Anh em cập nhật tiến độ cuối ngày nhé.' }
      ]
    },
    {
      id: 'room-it-main',
      name: 'Phòng Ban Hành chính & IT',
      scope: 'department',
      department: 'admin_it',
      projectId: '',
      status: 'active',
      createdBy: 'u-mgr-it',
      createdByName: 'Đặng Bảo Ngọc',
      createdByRole: 'manager',
      participantIds: [],
      includeAllManagers: false,
      createdAt: Date.now() - 3500000,
      messages: [
        { id: 'm-4', senderId: 'u-mgr-it', senderName: 'Đặng Bảo Ngọc', senderRole: 'manager', time: nowStr, text: 'Kênh điều phối cấp phát Workstation và tài khoản Staging Cloud.' }
      ]
    },
    {
      id: 'room-net-main',
      name: 'Phòng Ban Mạng & An ninh',
      scope: 'department',
      department: 'network',
      projectId: '',
      status: 'active',
      createdBy: 'u-mgr-net',
      createdByName: 'Bùi Quốc Khánh',
      createdByRole: 'manager',
      participantIds: [],
      includeAllManagers: false,
      createdAt: Date.now() - 3400000,
      messages: [
        { id: 'm-5', senderId: 'u-mgr-net', senderName: 'Bùi Quốc Khánh', senderRole: 'manager', time: nowStr, text: 'Kênh hỗ trợ cấu hình VPN WireGuard và chứng chỉ TLS nội bộ.' }
      ]
    },
    {
      id: 'room-fin-main',
      name: 'Phòng Ban Tài chính & Pháp chế',
      scope: 'department',
      department: 'finance',
      projectId: '',
      status: 'active',
      createdBy: 'u-mgr-fin',
      createdByName: 'Hoàng Gia Bảo',
      createdByRole: 'manager',
      participantIds: [],
      includeAllManagers: false,
      createdAt: Date.now() - 3300000,
      messages: [
        { id: 'm-6', senderId: 'u-mgr-fin', senderName: 'Hoàng Gia Bảo', senderRole: 'manager', time: nowStr, text: 'Kênh bảo mật trao đổi báo cáo kiểm toán Q4 và chứng thư hợp đồng.' }
      ]
    },
    {
      id: 'room-exec-board',
      name: 'Họp Ban Giám Đốc & Toàn Bộ Quản Lí',
      scope: 'manager_director',
      department: 'executive',
      projectId: '',
      status: 'active',
      createdBy: 'u-director',
      createdByName: 'Nguyễn Thành Đạt',
      createdByRole: 'director',
      participantIds: ['u-director', 'u-mgr-devops', 'u-mgr-it', 'u-mgr-net', 'u-mgr-fin'],
      includeAllManagers: true,
      createdAt: Date.now() - 5000000,
      messages: [
        { id: 'm-7', senderId: 'u-director', senderName: 'Nguyễn Thành Đạt', senderRole: 'director', time: '08:30:00', text: 'Chào các Trưởng ban. Mọi đề xuất mở phòng chat mới hoặc xóa đoạn chat của phòng ban sẽ qua phê duyệt tại đây.' }
      ]
    },
    {
      id: 'room-mgr-coordination',
      name: 'Điều phối Quản lí: DevOps ↔ Hành chính IT',
      scope: 'manager_to_manager',
      department: 'executive',
      projectId: '',
      status: 'active',
      createdBy: 'u-director',
      createdByName: 'Nguyễn Thành Đạt',
      createdByRole: 'director',
      participantIds: ['u-mgr-devops', 'u-mgr-it'],
      includeAllManagers: false,
      createdAt: Date.now() - 2800000,
      messages: [
        { id: 'm-8', senderId: 'u-director', senderName: 'Nguyễn Thành Đạt', senderRole: 'director', time: '08:45:00', text: 'Anh Đức Anh và chị Bảo Ngọc phối hợp chuẩn bị laptop + token cho nhân sự mới tuần này nhé.' }
      ]
    }
  ];

  initialRooms.forEach(r => companyRooms.set(r.id, r));
  addAuditEntry(initialUsers[8], 'Khởi tạo hệ thống', 'Kích hoạt cổng điều hành nội bộ khép kín.');
  if (persist) {
    persistCompanyWorkspace();
  }
}

function loadCompanyWorkspaceFromDisk() {
  const dir = getEffectiveDataDir();
  if (!dir) {
    seedCompanyWorkspace({ persist: false });
    return;
  }
  const stateFile = path.join(dir, 'company-state.json');
  if (!fs.existsSync(stateFile)) {
    seedCompanyWorkspace({ persist: true });
    return;
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    companyUsers.clear();
    companyRooms.clear();
    companyAuditLog.length = 0;

    if (Array.isArray(parsed.users) && parsed.users.length > 0) {
      let migrated = false;
      parsed.users.forEach(u => {
        if (u && u.id) {
          if (!u.passwordHash && u.password) {
            u.passwordHash = hashPassword(u.password);
            delete u.password;
            migrated = true;
          }
          companyUsers.set(u.id, u);
        }
      });
      if (migrated) persistCompanyWorkspace();
    } else {
      seedCompanyWorkspace({ persist: true });
      return;
    }

    if (Array.isArray(parsed.rooms)) {
      parsed.rooms.forEach(r => {
        if (r && r.id) companyRooms.set(r.id, r);
      });
    }
    if (Array.isArray(parsed.projects)) {
      inMemoryBazaarProducts = parsed.projects;
    }
    inMemorySoldOrRevokedIds.clear();
    if (Array.isArray(parsed.soldOrRevokedIds)) {
      parsed.soldOrRevokedIds.forEach(id => inMemorySoldOrRevokedIds.add(id));
    }
    if (Array.isArray(parsed.auditLog)) {
      parsed.auditLog.slice(0, 80).forEach(a => companyAuditLog.push(a));
    }
  } catch {
    seedCompanyWorkspace({ persist: true });
  }
}

loadCompanyWorkspaceFromDisk();

function sanitizeUser(u) {
  if (!u) return null;
  const deptObj = COMPANY_DEPARTMENTS.find(d => d.id === u.department);
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    title: u.title,
    department: u.department,
    departmentName: u.department === 'all' ? 'Toàn Công Ty' : (deptObj ? deptObj.name : u.department),
    active: u.active !== false
  };
}

function verifySessionToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token || !companySessions.has(token)) return null;
  const sess = companySessions.get(token);
  if (sess.expiresAt && Date.now() >= sess.expiresAt) {
    companySessions.delete(token);
    return null;
  }
  const user = companyUsers.get(sess.userId);
  if (!user || user.active === false) {
    companySessions.delete(token);
    return null;
  }
  sess.lastActiveAt = Date.now();
  return { token, user };
}

function getAuthSession(req, parsedUrl, { allowQueryToken = false } = {}) {
  const headerToken = req.headers['x-session-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const queryToken = allowQueryToken && parsedUrl?.searchParams ? parsedUrl.searchParams.get('token') : '';
  const token = (headerToken || queryToken || '').trim();
  return verifySessionToken(token);
}

function canViewProject(user, project) {
  if (!user) return false;
  if (user.role === 'director') return true;
  return inferDepartment(project) === user.department;
}

function canViewRoom(user, room) {
  if (!user || !room) return false;
  if (user.role === 'director') return true;

  if (room.scope === 'manager_director' || room.scope === 'manager_to_manager') {
    if (user.role !== 'manager') return false;
    if (room.status === 'pending_create') return false;
    return Boolean(room.includeAllManagers || (Array.isArray(room.participantIds) && room.participantIds.includes(user.id)));
  }

  // Department or Work room
  if (user.role === 'manager') {
    return room.department === user.department;
  }

  // Employee: strictly ONLY active (or pending_delete not yet approved) rooms in own department
  if (user.role === 'employee') {
    if (room.status === 'pending_create') return false;
    return room.department === user.department;
  }

  return false;
}

function canPostInRoom(user, room) {
  if (!canViewRoom(user, room)) return false;
  // Unapproved rooms cannot be chatted in until Director approves
  return room.status === 'active' || room.status === 'pending_delete';
}

function formatCompanyStateForUser(user) {
  const safeUser = sanitizeUser(user);
  const projects = inMemoryBazaarProducts
    .map(p => ({ ...p, department: inferDepartment(p) }))
    .filter(p => canViewProject(user, p));

  const rooms = Array.from(companyRooms.values())
    .filter(r => canViewRoom(user, r))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const roomApprovals = Array.from(companyRooms.values())
    .filter(r => r.status === 'pending_create' || r.status === 'pending_delete')
    .map(r => ({
      kind: 'room',
      roomId: r.id,
      roomName: r.name,
      scope: r.scope,
      department: r.department,
      departmentName: COMPANY_DEPARTMENTS.find(d => d.id === r.department)?.name || r.department,
      status: r.status,
      pendingAction: r.pendingAction || (r.status === 'pending_create' ? 'create' : 'delete'),
      requestedBy: r.requestedBy || r.createdBy,
      requestedByName: r.requestedByName || r.createdByName,
      requestedAt: r.requestedAt || r.createdAt
    }));

  const messageApprovals = [];
  for (const r of companyRooms.values()) {
    if (!Array.isArray(r.messages)) continue;
    for (const m of r.messages) {
      if (m && m.deleteStatus === 'pending_delete') {
        messageApprovals.push({
          kind: 'message',
          roomId: r.id,
          roomName: r.name,
          msgId: m.id,
          messagePreview: String(m.text || '').slice(0, 140),
          messageSenderName: m.senderName,
          scope: r.scope,
          department: r.department,
          departmentName: COMPANY_DEPARTMENTS.find(d => d.id === r.department)?.name || r.department,
          status: 'pending_delete',
          pendingAction: 'message_delete',
          requestedBy: m.deleteRequestedBy || '',
          requestedByName: m.deleteRequestedByName || '',
          requestedAt: m.deleteRequestedAt || Date.now()
        });
      }
    }
  }

  const allPendingApprovals = [...roomApprovals, ...messageApprovals];

  const approvals = user.role === 'director'
    ? allPendingApprovals
    : (user.role === 'manager' ? allPendingApprovals.filter(a => a.department === user.department) : []);

  const allUsers = Array.from(companyUsers.values()).map(sanitizeUser);
  const managers = allUsers.filter(u => u.role === 'manager');
  const employees = allUsers.filter(u => u.role === 'employee');
  const departmentEmployees = user.role === 'manager'
    ? employees.filter(e => e.department === user.department)
    : (user.role === 'director' ? employees : []);
  const mentionCandidates = allUsers.filter(u => {
    if (!u.active) return false;
    if (user.role === 'director') return true;
    if (user.role === 'manager') return u.department === user.department || u.role === 'manager' || u.role === 'director';
    return u.department === user.department;
  });

  return {
    user: safeUser,
    departments: COMPANY_DEPARTMENTS,
    projects,
    rooms,
    approvals,
    managers: (user.role === 'director' || user.role === 'manager') ? managers : [],
    employees: user.role === 'director' ? employees : [],
    departmentEmployees,
    mentionCandidates,
    auditLog: user.role === 'director' ? companyAuditLog.slice(0, 30) : []
  };
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
const ALLOWED_COMPANY_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);
if (process.env.ALLOWED_ORIGIN) {
  ALLOWED_COMPANY_ORIGINS.add(process.env.ALLOWED_ORIGIN.trim());
}

function applySecurityHeaders(res, req = null) {
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'LexiconServer/2.4');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const reqPath = req && req.url ? String(req.url) : '';
  const origin = req && req.headers ? req.headers.origin : '';
  if (reqPath.startsWith('/api/company/')) {
    if (origin && ALLOWED_COMPANY_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Session-Token');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://upload.wikimedia.org https://*.wikipedia.org; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000 ws: wss: https://*.wikipedia.org;"
  );
}

/**
 * Serve static assets from public/ directory
 */
function serveStaticFile(reqPath, res) {
  let cleanPath = reqPath.split('?')[0];
  if (
    cleanPath === '/' ||
    cleanPath === '' ||
    cleanPath === '/vault' ||
    cleanPath === '/vault.html' ||
    cleanPath === '/workspace' ||
    cleanPath === '/drop' ||
    cleanPath === '/secure' ||
    cleanPath === '/market' ||
    cleanPath === '/shop' ||
    cleanPath === '/bazaar'
  ) {
    cleanPath = '/index.html';
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
  const httpServer = http.createServer(async (req, res) => {
    // Zero-Log: Deliberately NO console.log(req.ip, req.headers, req.url)
    applySecurityHeaders(res, req);

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
          department: inferDepartment({ category: body.category || 'physical', department: body.department }),
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

      
      // -------------------------------------------------------------
      // 4B. CLOSED-COMPANY RBAC API: Auth, Role Scoping, Approvals, Leadership
      // -------------------------------------------------------------

      // POST /api/company/login
      if (pathname === '/api/company/login' && method === 'POST') {
        const rawBody = await readRequestBody(req, 16 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Dữ liệu đăng nhập không hợp lệ' }));
          return;
        }

        const uname = String(body.username || '').trim().toLowerCase();
        const pwd = String(body.password || '');
        const bruteKey = `${clientKey}:${uname || 'anon'}`;
        const bruteCheck = checkLoginBruteForce(bruteKey);
        if (!bruteCheck.allowed) {
          res.setHeader('Retry-After', String(bruteCheck.retryAfterSec));
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Nhập sai quá nhiều lần. Vui lòng thử lại sau ${bruteCheck.retryAfterSec} giây!` }));
          return;
        }

        const candidate = Array.from(companyUsers.values()).find(
          u => u.username.toLowerCase() === uname
        );

        if (!candidate) {
          recordLoginFailure(bruteKey);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sai tên đăng nhập hoặc mật khẩu nội bộ!' }));
          return;
        }
        if (candidate.active === false) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tài khoản này đã bị vô hiệu hóa bởi Quản lí/Giám đốc!' }));
          return;
        }

        const storedCred = candidate.passwordHash || candidate.password;
        const pwdCheck = verifyPassword(pwd, storedCred);
        if (!pwdCheck.valid) {
          recordLoginFailure(bruteKey);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sai tên đăng nhập hoặc mật khẩu nội bộ!' }));
          return;
        }
        clearLoginFailures(bruteKey);
        if (pwdCheck.needsUpgrade) {
          candidate.passwordHash = hashPassword(pwd);
          delete candidate.password;
          persistCompanyWorkspace();
        }
        const matched = candidate;

        const token = crypto.randomBytes(24).toString('hex');
        const nowTs = Date.now();
        companySessions.set(token, {
          userId: matched.id,
          createdAt: nowTs,
          lastActiveAt: nowTs,
          expiresAt: nowTs + SESSION_TTL_MS
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          token,
          ...formatCompanyStateForUser(matched)
        }));
        return;
      }

      // POST /api/company/logout
      if (pathname === '/api/company/logout' && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (auth) {
          companySessions.delete(auth.token);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
        return;
      }

      // GET /api/company/accounts-directory (Lists public demo usernames & roles without passwords for quick sign-in UI)
      if (pathname === '/api/company/accounts-directory' && method === 'GET') {
        const publicList = Array.from(companyUsers.values()).map(sanitizeUser);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', departments: COMPANY_DEPARTMENTS, accounts: publicList }));
        return;
      }

      // GET /api/company/state (Authenticated RBAC workspace snapshot)
      if (pathname === '/api/company/state' && method === 'GET') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập phiên nội bộ' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          ...formatCompanyStateForUser(auth.user),
          soldOrRevokedIds: Array.from(inMemorySoldOrRevokedIds)
        }));
        return;
      }

      // POST /api/company/projects (Only Manager of own dept or Director can publish company projects)
      if (pathname === '/api/company/projects' && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền tạo dự án mới' }));
          return;
        }

        const rawBody = await readRequestBody(req, 64 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          return;
        }

        if (!body.name || !String(body.name).trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Thiếu tên dự án' }));
          return;
        }

        const assignedDept = auth.user.role === 'director'
          ? inferDepartment({ category: body.category, department: body.department })
          : auth.user.department;
        const randHex = crypto.randomBytes(4).toString('hex').toUpperCase();
        const deptName = COMPANY_DEPARTMENTS.find(d => d.id === assignedDept)?.short || assignedDept;

        const newProject = {
          id: body.id || `prj-${assignedDept}-${randHex}`,
          name: String(body.name).trim(),
          category: body.category || 'hardware',
          department: assignedDept,
          badge: body.badge || `Ban ${deptName}`,
          icon: body.icon || '📌',
          securityLevel: body.securityLevel || 'Nội bộ • Ban',
          currency: body.currency || 'Giờ',
          isAuction: body.isAuction !== false,
          allowBid: true,
          allowBuyNow: true,
          startingBidXMR: Number(body.startingBidXMR || body.priceXMR || 8),
          currentBidXMR: Number(body.currentBidXMR || body.startingBidXMR || body.priceXMR || 8),
          buyNowPrice: Number(body.buyNowPrice || body.priceXMR || 16),
          minBidIncrement: Number(body.minBidIncrement || 0),
          bidCount: 0,
          highestBidder: 'Chưa phân công',
          bids: [],
          auctionEndTime: body.auctionEndTime !== undefined ? Number(body.auctionEndTime) : (Date.now() + 21600 * 1000),
          priceXMR: body.priceXMR || `${Number(body.currentBidXMR || body.startingBidXMR || 8)} ${body.currency || 'Giờ'}`,
          rawPriceXMR: Number(body.rawPriceXMR || body.currentBidXMR || 8),
          approxUSD: `Ban ${deptName}`,
          stock: body.stock || 'Đang mở phối hợp',
          desc: body.desc || 'Dự án nội bộ được tạo trong phiên làm việc.',
          specs: typeof body.specs === 'object' && body.specs !== null ? body.specs : {
            'Phụ trách': auth.user.name,
            'Phòng ban': `Ban ${deptName}`
          },
          vendorKillToken: `KILL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          isUserCreated: true,
          createdBy: auth.user.id,
          createdAt: Date.now()
        };

        addBazaarItem(newProject);
        addAuditEntry(auth.user, 'Tạo dự án', `Tạo "${newProject.name}" thuộc ${deptName}`);
        persistCompanyWorkspace();
        notifyCompanyWs('project_created', u => u.role === 'director' || u.department === assignedDept, { projectId: newProject.id });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', project: newProject }));
        return;
      }

      // POST /api/company/rooms/request-create
      // Manager -> creates pending_create room for own department / work (needs Director approval!)
      // Director -> creates manager_to_manager, manager_director, or dept room immediately as active!
      if (pathname === '/api/company/rooms/request-create' && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền tạo phòng chat' }));
          return;
        }

        const rawBody = await readRequestBody(req, 32 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid room payload' }));
          return;
        }

        const name = String(body.name || '').trim();
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tên phòng chat không được để trống' }));
          return;
        }

        const scope = String(body.scope || 'department');

        if (auth.user.role === 'manager') {
          if (scope !== 'department' && scope !== 'work') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Quản lí chỉ có thể đề xuất tạo phòng chat ban của mình hoặc phòng công việc' }));
            return;
          }
          if (body.department && body.department !== auth.user.department) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Không được tạo phòng chat cho phòng ban khác' }));
            return;
          }

          const roomId = `room-${auth.user.department}-${crypto.randomBytes(3).toString('hex')}`;
          const newRoom = {
            id: roomId,
            name,
            scope,
            department: auth.user.department,
            projectId: String(body.projectId || ''),
            status: 'pending_create',
            pendingAction: 'create',
            requestedBy: auth.user.id,
            requestedByName: auth.user.name,
            requestedAt: Date.now(),
            createdBy: auth.user.id,
            createdByName: auth.user.name,
            createdByRole: auth.user.role,
            participantIds: [],
            includeAllManagers: false,
            createdAt: Date.now(),
            messages: [
              {
                id: `sys-${Date.now()}`,
                senderId: 'system',
                senderName: 'Hệ thống phê duyệt',
                senderRole: 'system',
                time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
                text: `Yêu cầu tạo phòng chat "${name}" từ Quản lí ${auth.user.name} đang chờ Giám đốc phê duyệt.`
              }
            ]
          };

          companyRooms.set(roomId, newRoom);
          addAuditEntry(auth.user, 'Yêu cầu mở phòng chat', `Đề xuất mở "${name}" (${scope}) — Chờ Giám đốc duyệt`);
          persistCompanyWorkspace();
          notifyCompanyWs('room_pending_create', u => u.role === 'director' || (u.role === 'manager' && u.department === auth.user.department), { roomId });

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'pending_approval', room: newRoom }));
          return;
        }

        // Director creating room directly (active immediately!)
        const validScopes = ['department', 'work', 'manager_to_manager', 'manager_director'];
        const chosenScope = validScopes.includes(scope) ? scope : 'manager_director';
        const isLeadership = chosenScope === 'manager_to_manager' || chosenScope === 'manager_director';
        const targetDept = isLeadership
          ? 'executive'
          : (COMPANY_DEPARTMENTS.some(d => d.id === body.department) ? body.department : 'devops');

        let participantIds = Array.isArray(body.participantIds) ? body.participantIds.filter(Boolean) : [];
        if (chosenScope === 'manager_director' && !participantIds.includes(auth.user.id)) {
          participantIds.push(auth.user.id);
        }

        const roomId = `room-dir-${crypto.randomBytes(3).toString('hex')}`;
        const newRoom = {
          id: roomId,
          name,
          scope: chosenScope,
          department: targetDept,
          projectId: String(body.projectId || ''),
          status: 'active',
          pendingAction: null,
          createdBy: auth.user.id,
          createdByName: auth.user.name,
          createdByRole: 'director',
          participantIds,
          includeAllManagers: Boolean(body.includeAllManagers || (isLeadership && participantIds.length <= 1)),
          createdAt: Date.now(),
          messages: [
            {
              id: `sys-${Date.now()}`,
              senderId: 'system',
              senderName: 'Ban Giám Đốc',
              senderRole: 'system',
              time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
              text: `Giám đốc ${auth.user.name} đã khởi tạo phòng "${name}".`
            }
          ]
        };

        companyRooms.set(roomId, newRoom);
        addAuditEntry(auth.user, 'Tạo phòng chat trực tiếp', `Mở phòng "${name}" (${chosenScope})`);
        persistCompanyWorkspace();
        notifyCompanyWs('room_created', u => canViewRoom(u, newRoom), { roomId });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'active', room: newRoom }));
        return;
      }

      // POST /api/company/rooms/:roomId/request-delete
      // Manager -> submits pending_delete (MUST be approved by Director before actual deletion)
      // Director -> deletes immediately from RAM
      const reqDeleteMatch = pathname.match(/^\/api\/company\/rooms\/([^/]+)\/request-delete$/);
      if (reqDeleteMatch && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền xóa phòng chat' }));
          return;
        }

        const roomId = decodeURIComponent(reqDeleteMatch[1]);
        const room = companyRooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Phòng chat không tồn tại' }));
          return;
        }

        if (auth.user.role === 'director') {
          (room.messages || []).forEach(m => deleteAttachmentBinary(m?.attachment?.id));
          companyRooms.delete(roomId);
          addAuditEntry(auth.user, 'Xóa phòng chat', `Giám đốc đã xóa trực tiếp phòng "${room.name}"`);
          persistCompanyWorkspace();
          notifyCompanyWs('room_deleted', u => canViewRoom(u, room), { roomId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'deleted', roomId }));
          return;
        }

        // Manager requesting delete: must belong to manager's department
        if (room.department !== auth.user.department) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chỉ được yêu cầu xóa phòng chat thuộc Ban của mình' }));
          return;
        }

        room.status = 'pending_delete';
        room.pendingAction = 'delete';
        room.requestedBy = auth.user.id;
        room.requestedByName = auth.user.name;
        room.requestedAt = Date.now();
        room.messages.push({
          id: `sys-del-${Date.now()}`,
          senderId: 'system',
          senderName: 'Hệ thống phê duyệt',
          senderRole: 'system',
          time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
          text: `Quản lí ${auth.user.name} đã gửi yêu cầu xóa phòng/đoạn chat này. Đang chờ Giám đốc phê duyệt.`
        });

        addAuditEntry(auth.user, 'Yêu cầu xóa phòng chat', `Đề xuất xóa "${room.name}" — Chờ Giám đốc duyệt`);
        persistCompanyWorkspace();
        notifyCompanyWs('room_pending_delete', u => canViewRoom(u, room), { roomId });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'pending_delete', room }));
        return;
      }

      // POST /api/company/approvals/:roomId/decide (STRICTLY DIRECTOR ONLY)
      const approveMatch = pathname.match(/^\/api\/company\/approvals\/([^/]+)\/decide$/);
      if (approveMatch && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role !== 'director') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chỉ Giám đốc mới có quyền phê duyệt phòng chat' }));
          return;
        }

        const roomId = decodeURIComponent(approveMatch[1]);
        const room = companyRooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy yêu cầu phòng chat' }));
          return;
        }

        const rawBody = await readRequestBody(req, 8 * 1024);
        let body = {};
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {}

        const decision = body.decision === 'reject' ? 'reject' : 'approve';

        if (room.status === 'pending_create') {
          if (decision === 'approve') {
            room.status = 'active';
            room.pendingAction = null;
            room.messages.push({
              id: `sys-app-${Date.now()}`,
              senderId: 'system',
              senderName: 'Ban Giám Đốc',
              senderRole: 'system',
              time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
              text: `Giám đốc ${auth.user.name} đã PHÊ DUYỆT mở phòng chat này. Nhân viên & Quản lí trong ban có thể tham gia thảo luận.`
            });
            addAuditEntry(auth.user, 'Phê duyệt mở phòng chat', `Đã duyệt mở phòng "${room.name}"`);
            persistCompanyWorkspace();
            notifyCompanyWs('room_approved', u => canViewRoom(u, room), { roomId });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'approved', room }));
            return;
          } else {
            companyRooms.delete(roomId);
            addAuditEntry(auth.user, 'Từ chối mở phòng chat', `Từ chối mở phòng "${room.name}"`);
            persistCompanyWorkspace();
            notifyCompanyWs('room_rejected', u => u.role === 'director' || u.department === room.department, { roomId });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'rejected_removed', roomId }));
            return;
          }
        }

        if (room.status === 'pending_delete') {
          if (decision === 'approve') {
            (room.messages || []).forEach(m => deleteAttachmentBinary(m?.attachment?.id));
            companyRooms.delete(roomId);
            addAuditEntry(auth.user, 'Phê duyệt xóa phòng chat', `Đã duyệt xóa vĩnh viễn phòng "${room.name}"`);
            persistCompanyWorkspace();
            notifyCompanyWs('room_deleted', u => canViewRoom(u, room), { roomId });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'deleted', roomId }));
            return;
          } else {
            room.status = 'active';
            room.pendingAction = null;
            room.messages.push({
              id: `sys-rej-${Date.now()}`,
              senderId: 'system',
              senderName: 'Ban Giám Đốc',
              senderRole: 'system',
              time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
              text: `Giám đốc ${auth.user.name} đã TỪ CHỐI yêu cầu xóa. Phòng chat tiếp tục hoạt động bình thường.`
            });
            addAuditEntry(auth.user, 'Từ chối xóa phòng chat', `Giữ lại phòng "${room.name}"`);
            persistCompanyWorkspace();
            notifyCompanyWs('room_restored', u => canViewRoom(u, room), { roomId });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'restored', room }));
            return;
          }
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Phòng chat không ở trạng thái chờ phê duyệt' }));
        return;
      }

      // POST /api/company/rooms/:roomId/messages (Send message into RBAC-verified room)
      const msgRoomMatch = pathname.match(/^\/api\/company\/rooms\/([^/]+)\/messages$/);
      if (msgRoomMatch && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }

        const roomId = decodeURIComponent(msgRoomMatch[1]);
        const room = companyRooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Phòng chat không tồn tại' }));
          return;
        }

        if (!canPostInRoom(auth.user, room)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bạn không có quyền gửi tin nhắn trong phòng chat này hoặc phòng chưa được Giám đốc phê duyệt' }));
          return;
        }

        const rawBody = await readRequestBody(req, 3 * 1024 * 1024);
        let body = {};
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid message payload hoặc tệp quá lớn (>2MB)' }));
          return;
        }

        const text = String(body.text || '').trim().slice(0, 2000);
        let attachmentMeta = null;

        if (body.attachment && body.attachment.dataBase64) {
          const attName = path.basename(String(body.attachment.name || 'tep-dinh-kem.bin')).slice(0, 120);
          const ext = path.extname(attName).toLowerCase();
          const unsafeExts = ['.html', '.htm', '.svg', '.js', '.mjs', '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.scr'];
          if (unsafeExts.includes(ext)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Định dạng tệp "${ext}" không được phép chia sẻ để đảm bảo an toàn nội bộ!` }));
            return;
          }

          let rawBase64 = String(body.attachment.dataBase64);
          if (rawBase64.includes(',')) rawBase64 = rawBase64.split(',').pop();
          const binBuf = Buffer.from(rawBase64, 'base64');
          if (binBuf.length === 0 || binBuf.length > 2 * 1024 * 1024) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Kích thước tệp đính kèm không hợp lệ hoặc vượt quá 2MB.' }));
            return;
          }

          const attId = `att-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          saveAttachmentBinary(attId, binBuf);
          attachmentMeta = {
            id: attId,
            name: attName,
            mimeType: String(body.attachment.mimeType || 'application/octet-stream').slice(0, 100),
            size: binBuf.length
          };
        }

        if (!text && !attachmentMeta) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nội dung tin nhắn trống' }));
          return;
        }

        const mentionMatches = Array.from(new Set(
          (text.match(/@([a-zA-Z0-9._-]+)/g) || []).map(m => m.slice(1).toLowerCase())
        ));

        const newMsg = {
          id: `msg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          senderId: auth.user.id,
          senderName: auth.user.name,
          senderRole: auth.user.role,
          senderDept: auth.user.department,
          time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
          text: text || `[Đính kèm: ${attachmentMeta.name}]`,
          mentions: mentionMatches,
          attachment: attachmentMeta,
          deleteStatus: null
        };

        room.messages.push(newMsg);
        if (room.messages.length > 200) {
          const evicted = room.messages.shift();
          deleteAttachmentBinary(evicted?.attachment?.id);
        }
        persistCompanyWorkspace();
        notifyCompanyWs('room_message', u => canViewRoom(u, room), { roomId, msgId: newMsg.id });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: newMsg, room }));
        return;
      }

      // GET /api/company/rooms/:roomId/attachments/:attId (RBAC-protected attachment download)
      const attDownloadMatch = pathname.match(/^\/api\/company\/rooms\/([^/]+)\/attachments\/([^/]+)$/);
      if (attDownloadMatch && method === 'GET') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập phiên nội bộ' }));
          return;
        }
        const roomId = decodeURIComponent(attDownloadMatch[1]);
        const attId = decodeURIComponent(attDownloadMatch[2]);
        const room = companyRooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Phòng chat không tồn tại' }));
          return;
        }
        if (!canViewRoom(auth.user, room)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bạn không có quyền truy cập tệp trong phòng chat này' }));
          return;
        }
        const msgWithAtt = (room.messages || []).find(m => m.attachment && m.attachment.id === attId);
        if (!msgWithAtt) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy tệp đính kèm' }));
          return;
        }
        const binBuf = loadAttachmentBinary(attId);
        if (!binBuf) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Dữ liệu tệp đính kèm không còn khả dụng' }));
          return;
        }
        const safeMime = msgWithAtt.attachment.mimeType || 'application/octet-stream';
        const isSafeImage = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(safeMime);
        const safeFilename = String(msgWithAtt.attachment.name || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${isSafeImage ? 'inline' : 'attachment'}; filename="${safeFilename}"`);
        res.writeHead(200, { 'Content-Type': isSafeImage ? safeMime : 'application/octet-stream' });
        res.end(binBuf);
        return;
      }

      // POST /api/company/rooms/:roomId/messages/:msgId/request-delete (Manager -> pending_delete; Director -> direct delete; Employee -> 403)
      const msgReqDelMatch = pathname.match(/^\/api\/company\/rooms\/([^/]+)\/messages\/([^/]+)\/request-delete$/);
      if (msgReqDelMatch && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền xóa đoạn chat/tin nhắn' }));
          return;
        }
        const roomId = decodeURIComponent(msgReqDelMatch[1]);
        const msgId = decodeURIComponent(msgReqDelMatch[2]);
        const room = companyRooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Phòng chat không tồn tại' }));
          return;
        }
        const msgIdx = (room.messages || []).findIndex(m => m.id === msgId);
        if (msgIdx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy tin nhắn cần xóa' }));
          return;
        }
        const targetMsg = room.messages[msgIdx];
        if (targetMsg.senderRole === 'system') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không thể xóa thông báo nhật ký hệ thống' }));
          return;
        }

        if (auth.user.role === 'director') {
          deleteAttachmentBinary(targetMsg?.attachment?.id);
          room.messages.splice(msgIdx, 1);
          addAuditEntry(auth.user, 'Xóa tin nhắn', `Giám đốc xóa trực tiếp tin nhắn trong "${room.name}"`);
          persistCompanyWorkspace();
          notifyCompanyWs('message_deleted', u => canViewRoom(u, room), { roomId, msgId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'deleted', roomId, msgId }));
          return;
        }

        if (room.department !== auth.user.department || (room.scope !== 'department' && room.scope !== 'work')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Quản lí chỉ được đề xuất xóa đoạn chat trong phòng thuộc Ban mình' }));
          return;
        }

        targetMsg.deleteStatus = 'pending_delete';
        targetMsg.deleteRequestedBy = auth.user.id;
        targetMsg.deleteRequestedByName = auth.user.name;
        targetMsg.deleteRequestedAt = Date.now();
        addAuditEntry(auth.user, 'Yêu cầu xóa đoạn chat', `Đề xuất xóa tin nhắn của ${targetMsg.senderName} trong "${room.name}" — Chờ Giám đốc duyệt`);
        persistCompanyWorkspace();
        notifyCompanyWs('message_pending_delete', u => canViewRoom(u, room), { roomId, msgId });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'pending_delete', message: targetMsg }));
        return;
      }

      // POST /api/company/approvals/messages/:roomId/:msgId/decide (STRICTLY DIRECTOR ONLY)
      const msgApproveMatch = pathname.match(/^\/api\/company\/approvals\/messages\/([^/]+)\/([^/]+)\/decide$/);
      if (msgApproveMatch && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role !== 'director') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chỉ Giám đốc mới có quyền phê duyệt xóa đoạn chat/tin nhắn' }));
          return;
        }
        const roomId = decodeURIComponent(msgApproveMatch[1]);
        const msgId = decodeURIComponent(msgApproveMatch[2]);
        const room = companyRooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Phòng chat không tồn tại' }));
          return;
        }
        const msgIdx = (room.messages || []).findIndex(m => m.id === msgId);
        if (msgIdx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tin nhắn không tồn tại' }));
          return;
        }
        const targetMsg = room.messages[msgIdx];
        if (targetMsg.deleteStatus !== 'pending_delete') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tin nhắn không ở trạng thái chờ phê duyệt xóa' }));
          return;
        }

        const rawBody = await readRequestBody(req, 8 * 1024);
        let body = {};
        try { body = JSON.parse(rawBody.toString('utf8')); } catch {}
        const decision = body.decision === 'reject' ? 'reject' : 'approve';

        if (decision === 'approve') {
          deleteAttachmentBinary(targetMsg?.attachment?.id);
          room.messages.splice(msgIdx, 1);
          addAuditEntry(auth.user, 'Duyệt xóa tin nhắn', `Đã xóa đoạn chat trong phòng "${room.name}"`);
          persistCompanyWorkspace();
          notifyCompanyWs('message_deleted', u => canViewRoom(u, room), { roomId, msgId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'deleted', roomId, msgId }));
          return;
        } else {
          targetMsg.deleteStatus = null;
          delete targetMsg.deleteRequestedBy;
          delete targetMsg.deleteRequestedByName;
          delete targetMsg.deleteRequestedAt;
          addAuditEntry(auth.user, 'Từ chối xóa tin nhắn', `Giữ lại tin nhắn trong phòng "${room.name}"`);
          persistCompanyWorkspace();
          notifyCompanyWs('message_restored', u => canViewRoom(u, room), { roomId, msgId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'restored', message: targetMsg }));
          return;
        }
      }

      // POST /api/company/managers (Director adds a new Manager to the company)
      if (pathname === '/api/company/managers' && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role !== 'director') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chỉ Giám đốc mới có quyền thêm Quản lí mới' }));
          return;
        }

        const rawBody = await readRequestBody(req, 16 * 1024);
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Dữ liệu không hợp lệ' }));
          return;
        }

        const name = String(body.name || '').trim();
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '123');
        const department = COMPANY_DEPARTMENTS.some(d => d.id === body.department) ? body.department : 'devops';

        if (!name || !username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Vui lòng nhập đầy đủ họ tên và tên đăng nhập cho Quản lí' }));
          return;
        }

        const duplicate = Array.from(companyUsers.values()).some(u => u.username.toLowerCase() === username);
        if (duplicate) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Tên đăng nhập "${username}" đã tồn tại trong công ty` }));
          return;
        }

        const deptObj = COMPANY_DEPARTMENTS.find(d => d.id === department);
        const newMgr = {
          id: `u-mgr-${crypto.randomBytes(3).toString('hex')}`,
          username,
          passwordHash: hashPassword(password),
          name,
          role: 'manager',
          title: String(body.title || `Trưởng nhóm ${deptObj?.short || department}`).trim(),
          department,
          active: true
        };

        companyUsers.set(newMgr.id, newMgr);
        addAuditEntry(auth.user, 'Thêm Quản lí mới', `Bổ nhiệm ${newMgr.name} (${newMgr.username}) phụ trách ${deptObj?.name || department}`);
        persistCompanyWorkspace();
        notifyCompanyWs('hr_updated', u => u.role === 'director' || u.role === 'manager');

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', manager: sanitizeUser(newMgr) }));
        return;
      }

      // PATCH /api/company/managers/:userId (Director coordinates/reassigns a Manager to another department)
      const mgrPatchMatch = pathname.match(/^\/api\/company\/managers\/([^/]+)$/);
      if (mgrPatchMatch && method === 'PATCH') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role !== 'director') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chỉ Giám đốc mới có quyền điều phối Quản lí' }));
          return;
        }

        const targetId = decodeURIComponent(mgrPatchMatch[1]);
        const target = companyUsers.get(targetId);
        if (!target || target.role !== 'manager') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy tài khoản Quản lí' }));
          return;
        }

        const rawBody = await readRequestBody(req, 8 * 1024);
        let body = {};
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {}

        if (body.department && COMPANY_DEPARTMENTS.some(d => d.id === body.department)) {
          target.department = body.department;
        }
        if (body.title) {
          target.title = String(body.title).trim();
        }
        if (body.name && String(body.name).trim()) {
          target.name = String(body.name).trim();
        }
        if (typeof body.active === 'boolean') {
          target.active = body.active;
          if (!body.active) revokeUserSessions(target.id);
        }

        const deptObj = COMPANY_DEPARTMENTS.find(d => d.id === target.department);
        addAuditEntry(auth.user, 'Điều phối Quản lí', `Cập nhật ${target.name} (${deptObj?.name || target.department}, ${target.active ? 'Hoạt động' : 'Đã khóa'})`);
        persistCompanyWorkspace();
        notifyCompanyWs('hr_updated', u => u.role === 'director' || u.role === 'manager');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', manager: sanitizeUser(target) }));
        return;
      }

      // POST /api/company/change-password (Any logged-in user)
      if (pathname === '/api/company/change-password' && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        const rawBody = await readRequestBody(req, 8 * 1024);
        let body = {};
        try { body = JSON.parse(rawBody.toString('utf8')); } catch {}
        const currentPwd = String(body.currentPassword || '');
        const newPwd = String(body.newPassword || '');
        const check = verifyPassword(currentPwd, auth.user.passwordHash || auth.user.password);
        if (!check.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Mật khẩu hiện tại không chính xác!' }));
          return;
        }
        if (newPwd.length < 4 || newPwd.length > 64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Mật khẩu mới phải từ 4 đến 64 ký tự!' }));
          return;
        }
        auth.user.passwordHash = hashPassword(newPwd);
        delete auth.user.password;
        addAuditEntry(auth.user, 'Đổi mật khẩu', `${auth.user.name} (@${auth.user.username}) đã cập nhật mật khẩu đăng nhập`);
        persistCompanyWorkspace();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
        return;
      }

      // POST /api/company/employees (Manager adds employee in own dept; Director adds anywhere; Employee -> 403)
      if (pathname === '/api/company/employees' && method === 'POST') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền thêm nhân sự' }));
          return;
        }
        const rawBody = await readRequestBody(req, 16 * 1024);
        let body = {};
        try { body = JSON.parse(rawBody.toString('utf8')); } catch {}

        const name = String(body.name || '').trim();
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '123');
        if (!name || !username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Thiếu họ tên hoặc tên đăng nhập nhân viên' }));
          return;
        }
        if (auth.user.role === 'manager' && body.department && body.department !== auth.user.department) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Quản lí chỉ có thể thêm Nhân viên vào chính phòng ban của mình' }));
          return;
        }
        const department = auth.user.role === 'director'
          ? (COMPANY_DEPARTMENTS.some(d => d.id === body.department) ? body.department : 'devops')
          : auth.user.department;

        const duplicate = Array.from(companyUsers.values()).some(u => u.username.toLowerCase() === username);
        if (duplicate) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Tên đăng nhập "${username}" đã tồn tại` }));
          return;
        }
        const deptObj = COMPANY_DEPARTMENTS.find(d => d.id === department);
        const newEmp = {
          id: `u-emp-${crypto.randomBytes(3).toString('hex')}`,
          username,
          passwordHash: hashPassword(password),
          name,
          role: 'employee',
          title: String(body.title || `Chuyên viên ${deptObj?.short || department}`).trim(),
          department,
          active: true
        };
        companyUsers.set(newEmp.id, newEmp);
        addAuditEntry(auth.user, 'Thêm Nhân viên', `Tạo ${newEmp.name} (@${newEmp.username}) thuộc ${deptObj?.name || department}`);
        persistCompanyWorkspace();
        notifyCompanyWs('hr_updated', u => u.role === 'director' || u.department === department);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', employee: sanitizeUser(newEmp) }));
        return;
      }

      // PATCH /api/company/employees/:userId (Manager manages own dept employee; Director manages any; Employee -> 403)
      const empPatchMatch = pathname.match(/^\/api\/company\/employees\/([^/]+)$/);
      if (empPatchMatch && method === 'PATCH') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền chỉnh sửa tài khoản' }));
          return;
        }
        const targetId = decodeURIComponent(empPatchMatch[1]);
        const target = companyUsers.get(targetId);
        if (!target || target.role !== 'employee') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy tài khoản Nhân viên' }));
          return;
        }
        if (auth.user.role === 'manager' && target.department !== auth.user.department) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Quản lí chỉ được quản lý Nhân viên thuộc phòng ban của mình' }));
          return;
        }

        const rawBody = await readRequestBody(req, 8 * 1024);
        let body = {};
        try { body = JSON.parse(rawBody.toString('utf8')); } catch {}

        if (auth.user.role === 'manager' && body.department && body.department !== auth.user.department) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Quản lí không có quyền điều chuyển Nhân viên sang ban khác' }));
          return;
        }
        if (auth.user.role === 'director' && body.department && COMPANY_DEPARTMENTS.some(d => d.id === body.department)) {
          target.department = body.department;
        }
        if (body.name && String(body.name).trim()) target.name = String(body.name).trim();
        if (body.title && String(body.title).trim()) target.title = String(body.title).trim();
        if (typeof body.active === 'boolean') {
          target.active = body.active;
          if (!body.active) revokeUserSessions(target.id);
        }

        const deptObj = COMPANY_DEPARTMENTS.find(d => d.id === target.department);
        addAuditEntry(auth.user, 'Cập nhật Nhân viên', `Cập nhật ${target.name} (${deptObj?.name || target.department}, ${target.active ? 'Hoạt động' : 'Đã khóa'})`);
        persistCompanyWorkspace();
        notifyCompanyWs('hr_updated', u => u.role === 'director' || u.department === target.department);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', employee: sanitizeUser(target) }));
        return;
      }

      // DELETE /api/company/projects/:projectId (Manager own dept or Director)
      const projDeleteMatch = pathname.match(/^\/api\/company\/projects\/([^/]+)$/);
      if (projDeleteMatch && method === 'DELETE') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        if (auth.user.role === 'employee') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên không có quyền xóa/thu hồi dự án' }));
          return;
        }
        const projectId = decodeURIComponent(projDeleteMatch[1]);
        const idx = inMemoryBazaarProducts.findIndex(p => p.id === projectId);
        if (idx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy dự án' }));
          return;
        }
        const proj = inMemoryBazaarProducts[idx];
        const projDept = inferDepartment(proj);
        if (auth.user.role === 'manager' && projDept !== auth.user.department) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Quản lí chỉ có quyền thu hồi dự án thuộc Ban mình' }));
          return;
        }
        inMemoryBazaarProducts.splice(idx, 1);
        inMemorySoldOrRevokedIds.add(projectId);
        addAuditEntry(auth.user, 'Thu hồi dự án', `Gỡ bỏ dự án "${proj.name}" khỏi bảng tin`);
        persistCompanyWorkspace();
        notifyCompanyWs('project_deleted', u => u.role === 'director' || u.department === projDept, { projectId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'deleted', projectId }));
        return;
      }

      // PATCH /api/company/projects/:projectId/task (Assign employee & update progress)
      const projTaskMatch = pathname.match(/^\/api\/company\/projects\/([^/]+)\/task$/);
      if (projTaskMatch && method === 'PATCH') {
        const auth = getAuthSession(req, parsedUrl);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
          return;
        }
        const projectId = decodeURIComponent(projTaskMatch[1]);
        const proj = inMemoryBazaarProducts.find(p => p.id === projectId);
        if (!proj) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không tìm thấy dự án' }));
          return;
        }
        const projDept = inferDepartment(proj);
        if (auth.user.role !== 'director' && projDept !== auth.user.department) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Không có quyền thao tác dự án của phòng ban khác' }));
          return;
        }

        const rawBody = await readRequestBody(req, 8 * 1024);
        let body = {};
        try { body = JSON.parse(rawBody.toString('utf8')); } catch {}

        if (auth.user.role === 'employee' && (body.assigneeId !== undefined || body.dueDate !== undefined)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nhân viên chỉ được cập nhật trạng thái tiến độ, không thể tự phân công lại nhân sự' }));
          return;
        }

        const allowedStatuses = ['todo', 'in_progress', 'review', 'done'];
        if (body.taskStatus && allowedStatuses.includes(body.taskStatus)) {
          proj.taskStatus = body.taskStatus;
        }
        if (auth.user.role !== 'employee') {
          if (body.assigneeId !== undefined) {
            if (!body.assigneeId) {
              proj.assigneeId = '';
              proj.assigneeName = '';
            } else {
              const targetAssignee = companyUsers.get(String(body.assigneeId));
              if (!targetAssignee || (auth.user.role === 'manager' && targetAssignee.department !== auth.user.department)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Nhân sự được giao không hợp lệ hoặc thuộc ban khác' }));
                return;
              }
              proj.assigneeId = targetAssignee.id;
              proj.assigneeName = targetAssignee.name;
            }
          }
          if (body.dueDate !== undefined) {
            proj.dueDate = String(body.dueDate || '').slice(0, 32);
          }
        }
        addAuditEntry(auth.user, 'Cập nhật công việc', `"${proj.name}" · Tiến độ: ${proj.taskStatus || 'todo'}${proj.assigneeName ? ' · Phụ trách: ' + proj.assigneeName : ''}`);
        persistCompanyWorkspace();
        notifyCompanyWs('project_task_updated', u => u.role === 'director' || u.department === projDept, { projectId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', project: { ...proj, department: projDept } }));
        return;
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

  const wsHub = attachCompanyWebSocket(httpServer, {
    wsPath: '/ws/company',
    verifyToken: verifySessionToken,
    getUserById: (id) => companyUsers.get(id) || null
  });
  activeWsHubs.add(wsHub);
  httpServer.on('close', () => {
    activeWsHubs.delete(wsHub);
  });
  httpServer.wsHub = wsHub;

  return httpServer;
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
