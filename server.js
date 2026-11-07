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
    name: 'Lô 10 Chip Mật Mã HSM Air-Gapped EAL6+ Đấu Giá Kín',
    category: 'hardware',
    badge: 'Đấu Giá & Mua Ngay',
    icon: '🔨',
    securityLevel: 'Cấp 5 • Silent Bid',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.50,
    currentBidXMR: 0.85,
    buyNowPrice: 1.40,
    minBidIncrement: 0,
    bidCount: 4,
    highestBidder: 'Ghost-9A4F',
    bids: [
      { bidder: 'Ghost-9A4F', amount: 0.85, currency: 'XMR', time: '2 phút trước' },
      { bidder: 'Ghost-1B2C', amount: 0.80, currency: 'XMR', time: '8 phút trước' },
      { bidder: 'Ghost-5E3D', amount: 0.70, currency: 'XMR', time: '15 phút trước' },
      { bidder: 'Ghost-7A11', amount: 0.50, currency: 'XMR', time: '28 phút trước' }
    ],
    auctionEndTime: Date.now() + (5400 * 1000),
    priceXMR: '0.85 XMR',
    rawPriceXMR: 0.85,
    approxUSD: '~$140 USD',
    stock: '1 lô duy nhất',
    desc: 'Lô linh kiện phần cứng chip xử lý mật mã học độc lập EAL6+, chưa từng kết nối mạng, mở đấu giá tự do hoặc mua đứt ngay.',
    specs: {
      'Hình thức': 'Đấu giá tự do & Mua đứt 2 chiều',
      'Bước giá': 'Tự do không giới hạn',
      'Bàn giao': 'Mã Drop tự hủy hoặc Ship ẩn danh'
    }
  },
  {
    id: 'lux-watch-08',
    name: 'Đồng Hồ Cơ Patek Philippe Sưu Tầm & Vàng Khối 24K',
    category: 'physical',
    badge: 'Hàng Vật Lý',
    icon: '⌚',
    securityLevel: 'Escrow • Vật phẩm thực',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 12.00,
    currentBidXMR: 14.50,
    buyNowPrice: 18.00,
    minBidIncrement: 0,
    bidCount: 6,
    highestBidder: 'Ghost-77FE',
    bids: [
      { bidder: 'Ghost-77FE', amount: 14.50, currency: 'XMR', time: '5 phút trước' },
      { bidder: 'Ghost-3A91', amount: 13.20, currency: 'XMR', time: '19 phút trước' }
    ],
    auctionEndTime: Date.now() + (10800 * 1000),
    priceXMR: '14.50 XMR',
    rawPriceXMR: 14.50,
    approxUSD: '~$2,390 USD',
    stock: '1 chiếc nguyên hộp',
    desc: 'Vật phẩm sưu tầm thực tế ngoài đời thực, đầy đủ chứng nhận gốc, giao dịch qua hợp đồng ký quỹ ẩn danh và giao nhận Dead-Drop bảo mật.',
    specs: {
      'Danh mục': 'Hàng thực tế • Xa xỉ phẩm',
      'Chế độ': 'Trả giá tự do / Mua ngay',
      'Bàn giao': 'Hòm thư Dead-Drop / Bưu chính kín'
    }
  },
  {
    id: 'dig-domain-09',
    name: 'Tên Miền VIP 2 Ký Tự & Kho Tài Sản Số Độc Quyền',
    category: 'digital',
    badge: 'Tài Sản Số',
    icon: '💎',
    securityLevel: 'Instant • Transfer',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 2.00,
    currentBidXMR: 2.40,
    buyNowPrice: 3.50,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'Ghost-3C1A',
    bids: [
      { bidder: 'Ghost-3C1A', amount: 2.40, currency: 'XMR', time: '11 phút trước' }
    ],
    auctionEndTime: Date.now() + (7200 * 1000),
    priceXMR: '2.40 XMR',
    rawPriceXMR: 2.40,
    approxUSD: '~$395 USD',
    stock: 'Chuyển giao ngay',
    desc: 'Tài sản kỹ thuật số, tên miền ngắn quý hiếm kèm mã EPP Auth-Code chuyển nhượng quyền sở hữu tức thì qua kênh mã hóa một lần.',
    specs: {
      'Loại tài sản': 'Tên miền & Bản quyền số',
      'Đấu giá': 'Mở thầu tự do 24/7',
      'Bàn giao': 'Mã EPP / Khoá chuyển nhượng RAM'
    }
  },
  {
    id: 'hw-hsm-01',
    name: 'Khóa Bảo Mật Air-Gapped HSM Token v4',
    category: 'hardware',
    badge: 'Phần Cứng',
    icon: '🔑',
    securityLevel: 'Cấp 5 • FIPS 140-3',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.35,
    currentBidXMR: 0.45,
    buyNowPrice: 0.45,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'Ghost-4D88',
    bids: [
      { bidder: 'Ghost-4D88', amount: 0.45, currency: 'XMR', time: '14 phút trước' }
    ],
    auctionEndTime: Date.now() + (14400 * 1000),
    priceXMR: '0.45 XMR',
    rawPriceXMR: 0.45,
    approxUSD: '~$75 USD',
    stock: '5 chiếc',
    desc: 'Khóa vật lý USB chứa chip bảo mật chuyên dụng EAL6+, cách ly hoàn toàn (Air-gapped) khỏi mạng Internet. Tự hủy firmware khi phát hiện can thiệp vật lý.',
    specs: {
      'Tiêu chuẩn': 'FIPS 140-3 Level 4 / CC EAL6+',
      'Bảo vệ': 'Chống trích xuất vi mạch (Anti-DPA)',
      'Bàn giao': 'Bưu chính ẩn danh / Drop bí mật'
    }
  },
  {
    id: 'net-mesh-02',
    name: 'Cấu Hình Ephemeral Multi-Hop Mesh (RAM-Only)',
    category: 'network',
    badge: 'Mạng Lưới',
    icon: '🛰️',
    securityLevel: 'Cấp 5 • 5-Hop Obfs4',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.10,
    currentBidXMR: 0.15,
    buyNowPrice: 0.15,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'Ghost-8E02',
    bids: [],
    auctionEndTime: Date.now() + (18000 * 1000),
    priceXMR: '0.15 XMR',
    rawPriceXMR: 0.15,
    approxUSD: '~$25 USD',
    stock: 'Sẵn hàng',
    desc: 'Gói cấu hình định tuyến 5 lớp ngụy trang qua giao thức Obfs4 + WireGuard kết nối qua các cụm máy chủ RAM-only không lưu nhật ký truy cập (Zero-Log).',
    specs: {
      'Giao thức': 'WireGuard Obfuscated • Tor Over VPN',
      'Định tuyến': '5 bước nhảy (Multi-Hop) ngẫu nhiên',
      'Bàn giao': 'Mã Drop tự hủy sau 1 lần đọc'
    }
  },
  {
    id: 'sec-ssl-03',
    name: 'Chứng Chỉ SSL Bulletproof & DNS Chống Giám Sát',
    category: 'network',
    badge: 'Mạng Lưới',
    icon: '🛡️',
    securityLevel: 'Cấp 4 • ECH DNSSEC',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.15,
    currentBidXMR: 0.20,
    buyNowPrice: 0.20,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'Ghost-2A19',
    bids: [],
    auctionEndTime: Date.now() + (21600 * 1000),
    priceXMR: '0.20 XMR',
    rawPriceXMR: 0.20,
    approxUSD: '~$35 USD',
    stock: 'Sẵn hàng',
    desc: 'Cụm tên miền và chứng chỉ wildcard SSL phát hành nặc danh, định tuyến qua hệ thống Anycast DNS chống chặn ISP và loại bỏ rò rỉ SNI (ESNI/ECH).',
    specs: {
      'Công nghệ': 'Encrypted Client Hello (ECH) • DNSSEC',
      'Định danh': 'Ẩn hoàn toàn thông tin Whois / Khách hàng',
      'Bàn giao': 'Gói chứng chỉ nén kèm Private Key PGP'
    }
  },
  {
    id: 'doc-audit-04',
    name: 'Báo Cáo Nghiên Cứu Lỗ Hổng Zero-Day White-Hat Audit',
    category: 'audit',
    badge: 'Audit & PoC',
    icon: '📑',
    securityLevel: 'Cấp 5 • Top-Secret',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.60,
    currentBidXMR: 0.85,
    buyNowPrice: 0.85,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'Ghost-5B71',
    bids: [],
    auctionEndTime: Date.now() + (9000 * 1000),
    priceXMR: '0.85 XMR',
    rawPriceXMR: 0.85,
    approxUSD: '~$140 USD',
    stock: '2 bản đệm',
    desc: 'Tài liệu phân tích kỹ thuật độc quyền về kiến trúc chống nghe lén dữ liệu qua kênh bên (Side-channel attacks) và phương pháp vá lỗi cho giao thức mật mã đối xứng.',
    specs: {
      'Định dạng': 'PDF mã hóa AES-256-GCM + Khóa giải mật',
      'Nội dung': 'Whitepaper 48 trang + Script kiểm thử PoC',
      'Bàn giao': 'Mã Drop RAM-only'
    }
  },
  {
    id: 'os-amnesic-05',
    name: 'Tails/Qubes Amnesic USB OS Bootable Image',
    category: 'crypto',
    badge: 'Hệ Điều Hành',
    icon: '💾',
    securityLevel: 'Cấp 5 • Zero-Trace',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.20,
    currentBidXMR: 0.30,
    buyNowPrice: 0.30,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'Ghost-6F04',
    bids: [],
    auctionEndTime: Date.now() + (12600 * 1000),
    priceXMR: '0.30 XMR',
    rawPriceXMR: 0.30,
    approxUSD: '~$50 USD',
    stock: 'Sẵn hàng',
    desc: 'Bản phân phối Linux bảo mật tối đa được tùy biến sâu. Tự động xóa sạch RAM khi tắt máy, định tuyến 100% lưu lượng qua Tor, vô hiệu hóa hoàn toàn ghi đĩa.',
    specs: {
      'Bảo mật': 'Amnesic RAM-Only • Chống Forensic',
      'Checksum': 'SHA-256 xác thực kèm chữ ký PGP',
      'Bàn giao': 'Link tải tốc độ cao kèm khóa token'
    }
  },
  {
    id: 'key-pgp-06',
    name: 'Cặp Khóa PGP 4096-bit Sinh Trong Lồng Faraday',
    category: 'crypto',
    badge: 'Mật Mã Học',
    icon: '🗝️',
    securityLevel: 'Cấp 5 • Faraday Key',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.05,
    currentBidXMR: 0.10,
    buyNowPrice: 0.10,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'Ghost-0D33',
    bids: [],
    auctionEndTime: Date.now() + (16200 * 1000),
    priceXMR: '0.10 XMR',
    rawPriceXMR: 0.10,
    approxUSD: '~$18 USD',
    stock: '10 cặp khóa',
    desc: 'Cặp khóa riêng tư RSA-4096 / Ed25519 được sinh từ nguồn entropy phần cứng trong phòng cách ly sóng điện từ (Faraday cage), chưa từng chạm mạng Internet.',
    specs: {
      'Độ dài khóa': 'RSA 4096-bit + Ed25519 Subkeys',
      'Bảo mật': 'Zero Internet Exposure',
      'Bàn giao': 'Mã hóa gửi qua kênh drop dùng 1 lần'
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
          badge: body.badge || 'Đấu Giá & Mua Ngay',
          icon: body.icon || '💎',
          securityLevel: body.securityLevel || 'Escrow 2 Chiều • Tự Do',
          currency: body.currency || 'XMR',
          isAuction: body.isAuction !== false,
          allowBid: body.allowBid !== false,
          allowBuyNow: body.allowBuyNow !== false,
          startingBidXMR: Number(body.startingBidXMR || body.priceXMR || 0.1),
          currentBidXMR: Number(body.currentBidXMR || body.startingBidXMR || body.priceXMR || 0.1),
          buyNowPrice: Number(body.buyNowPrice || body.priceXMR || 1.0),
          minBidIncrement: Number(body.minBidIncrement || 0),
          bidCount: Number(body.bidCount || 0),
          highestBidder: body.highestBidder || 'Mở tự do',
          bids: Array.isArray(body.bids) ? body.bids : [],
          auctionEndTime: body.auctionEndTime !== undefined ? Number(body.auctionEndTime) : 0,
          priceXMR: body.priceXMR || `${Number(body.currentBidXMR || body.startingBidXMR || 0.1).toFixed(2)} ${body.currency || 'XMR'}`,
          rawPriceXMR: Number(body.rawPriceXMR || body.currentBidXMR || 0.1),
          approxUSD: body.approxUSD || '~$0 USD',
          stock: body.stock || 'Sẵn sàng giao ngay',
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
        const queryDealId = parsedUrl.query?.dealId;
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
            productName: body.productName || 'Giao dịch Ẩn danh',
            priceXMR: body.priceXMR || '0.00 XMR',
            initiatorAlias: body.initiatorAlias || '',
            buyerBlindId: `Khách-Ẩn-Danh #${buyerToken} [IP & ID: ĐÃ ẨN]`,
            sellerBlindId: `Người-Bán-Ẩn-Danh #${sellerToken} [IP & ID: ĐÃ ẨN]`,
            status: 'connected',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
              {
                id: `sys-${Date.now()}`,
                role: 'system',
                author: 'HỆ THỐNG KẾT NỐI MÙ (BLIND RELAY)',
                time: body.time || 'Vừa xong',
                text: `🔗 Đã kết nối phiên [${dealId}]: ID-Mua #${buyerToken} ↔ ID-Bán #${sellerToken}`
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
              productName: body.productName || 'Thương lượng Ẩn danh',
              priceXMR: body.priceXMR || '',
              initiatorAlias: body.senderAlias || '',
              buyerBlindId: `Khách-Ẩn-Danh #${buyerToken} [IP & ID: ĐÃ ẨN]`,
              sellerBlindId: `Người-Bán-Ẩn-Danh #${sellerToken} [IP & ID: ĐÃ ẨN]`,
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
              author: 'KÝ QUỸ RAM (ESCROW)',
              time: body.time || 'Vừa xong',
              text: `💸 Người mua đã xác nhận chuyển thanh toán vào Hợp đồng Ký quỹ RAM ${body.orderId ? `[${body.orderId}]` : ''}. Mặt hàng "${deal.productName}" đã tự động gỡ khỏi sàn công khai! Người bán vui lòng bàn giao và bấm "✅ Hoàn Tất Mua Hàng & Thanh Toán" để tự hủy đoạn chat!`
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
