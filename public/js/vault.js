/**
 * @file vault.js
 * @description Controller for the Stealth Anonymous Marketplace (Ghost Bazaar).
 * Strictly RAM-Only: Zero-Log IP, Ephemeral Identity, E2EE Chat & Complete Purge-On-Exit.
 */

import qrcode from './qrcode.mjs';
import {
  generateSymmetricKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  bufferToBase64Url,
  base64UrlToBuffer,
  encryptPayload,
  decryptPayload
} from './crypto-engine.js';

// Volatile in-memory state (Purged completely on page exit / ESC)
let sessionSeconds = 0;
let anonymousAlias = '';
let inMemoryChatMessages = [];
let activeOrder = null;
let orderCountdownTimer = null;
let currentChatInquiry = 'Tư vấn chung';

// WebRTC Peer-to-Peer State (100% Serverless, Browser-to-Browser, Zero-Log)
let peerInstance = null;
let activePeerConnection = null;
let currentRoomCode = null;
let isP2PConnected = false;
let isRoomHost = false;
let p2pPeerAlias = 'Đồng nghiệp P2P';
let typingDebounceTimer = null;

// Multi-region public STUN servers for zero-configuration P2P NAT traversal
const PEERJS_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

/**
 * Gentle Web Audio synthesizer chime for incoming P2P messages (Zero external asset dependency)
 */
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Autoplay policy or audio unsupported
  }
}

// Enterprise Workspace Items Registry (In-Memory Only)
let MARKET_PRODUCTS = [
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatColleagueAlias(raw) {
  if (!raw) return 'Đồng nghiệp';
  return String(raw)
    .replace(/^ID-Mua #/i, 'Thành viên #')
    .replace(/^ID-Bán #/i, 'Phụ trách #')
    .replace(/^ID-Mua$/i, 'Thành viên')
    .replace(/^ID-Bán$/i, 'Phụ trách');
}

/**
 * Modern non-blocking Toast notification system
 */
const recentToastMessages = new Map();

export function showToast(message, type = 'info') {
  if (!message) return;
  const container = document.getElementById('toast-container');
  if (!container) return;

  const now = Date.now();
  // De-duplicate identical toasts within 3.5 seconds to block notification storms
  if (recentToastMessages.has(message) && (now - recentToastMessages.get(message) < 3500)) {
    return;
  }
  recentToastMessages.set(message, now);

  // Maximum 3 visible toasts on screen to prevent flooding
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ');
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" aria-label="Đóng thông báo" title="Đóng"><span aria-hidden="true">✕</span></button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 200);
    }
  }, 3500);
}

/* ==========================================================================
   0. PERSISTENT SESSION & CATALOG STORAGE ENGINE (SURVIVES F5 RELOAD)
   ========================================================================== */

const STORAGE_KEYS = {
  ALIAS: 'nexus_member_alias_v2',
  MARKET_PRODUCTS: 'nexus_workspace_items_v2',
  REVOKED_IDS: 'nexus_revoked_item_ids_v2',
  MY_LISTINGS: 'nexus_my_listings_v2',
  ACTIVE_ORDER: 'nexus_active_handover_v2',
  ACTIVE_DEAL: 'nexus_active_session_v2',
  CHAT_MESSAGES: 'nexus_chat_messages_v2',
  ACTIVE_TAB: 'nexus_active_tab_v2',
  SESSION_SECONDS: 'nexus_session_seconds_v2'
};

let revokedProductIds = new Set();
let isPurgingNow = false;
let activeAutoDeal = null;
let lastBurnedDealId = null;

/**
 * Multi-origin resilient API fetch helper:
 * Tries current origin first, then automatically falls back to localhost:3000 / 127.0.0.1:3000
 * so multi-browser tests (e.g. Chrome + Opera GX or Live Server port) always reach the RAM server.
 */
const COMPANY_TOKEN_KEY = 'nexus_company_token_v1';
let companyAuthToken = null;
let currentCompanyState = null;
let companyPollTimer = null;
let workspaceModulesReady = false;
let lastProjectsSig = '';
let lastRoomsSig = '';
let lastApprovalsSig = '';
let lastManagersSig = '';
let lastTeamSig = '';
let lastAuditSig = '';
let accountsDirectoryCache = [];
let activeRoomFilter = 'all';
let pendingAttachmentPayload = null;
let mentionActiveIndex = 0;
let mentionSuggestions = [];

const ROLE_LABELS_VI = {
  employee: 'Nhân viên',
  manager: 'Quản lí',
  director: 'Giám đốc'
};

const TASK_STATUS_LABELS_VI = {
  todo: 'Chưa giao / Mới',
  in_progress: 'Đang thực hiện',
  review: 'Chờ kiểm tra',
  done: 'Đã hoàn thành'
};

const SCOPE_LABELS_VI = {
  department: 'Phòng ban',
  work: 'Công việc',
  manager_to_manager: 'Quản lí ↔ Quản lí',
  manager_director: 'Quản lí ↔ Giám đốc'
};

function isCompanyAuthActive() {
  return Boolean(companyAuthToken && currentCompanyState && currentCompanyState.user);
}

async function bazaarApiFetch(path, options = {}) {
  const candidates = [path];
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const port = window.location.port;
    if (port !== '3000') {
      candidates.push(`http://localhost:3000${path}`);
      candidates.push(`http://127.0.0.1:3000${path}`);
    } else if (host === 'localhost') {
      candidates.push(`http://127.0.0.1:3000${path}`);
    } else if (host === '127.0.0.1') {
      candidates.push(`http://localhost:3000${path}`);
    }
  }

  const mergedHeaders = { ...(options.headers || {}) };
  if (companyAuthToken && !mergedHeaders['X-Session-Token']) {
    mergedHeaders['X-Session-Token'] = companyAuthToken;
  }

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        cache: 'no-store'
      });
      if (res.ok || res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 || res.status === 409 || res.status === 429) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Network unreachable');
}

function loadRevokedIdsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REVOKED_IDS) || sessionStorage.getItem(STORAGE_KEYS.REVOKED_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        revokedProductIds = new Set(parsed);
      }
    }
  } catch {}
}

function addRevokedProductId(productId) {
  if (!productId) return;
  revokedProductIds.add(productId);
  try {
    const json = JSON.stringify(Array.from(revokedProductIds));
    localStorage.setItem(STORAGE_KEYS.REVOKED_IDS, json);
    sessionStorage.setItem(STORAGE_KEYS.REVOKED_IDS, json);
  } catch {}
}

function saveMyVendorListingsToStorage() {
  if (isPurgingNow) return;
  try {
    const json = JSON.stringify(myVendorListings);
    localStorage.setItem(STORAGE_KEYS.MY_LISTINGS, json);
    sessionStorage.setItem(STORAGE_KEYS.MY_LISTINGS, json);
  } catch {}
}

function syncMyVendorListingsWithMarket() {
  if (!Array.isArray(myVendorListings) || myVendorListings.length === 0) return;
  let changed = false;
  myVendorListings = myVendorListings
    .filter(item => item && !revokedProductIds.has(item.id))
    .map(item => {
      const marketMatch = MARKET_PRODUCTS.find(p => p.id === item.id);
      if (marketMatch) {
        changed = true;
        return {
          ...marketMatch,
          vendorKillToken: item.vendorKillToken || marketMatch.vendorKillToken
        };
      }
      return item;
    });
  if (changed) {
    saveMyVendorListingsToStorage();
  }
}

function saveMarketProductsToStorage() {
  if (isPurgingNow) return;
  try {
    const cleanList = MARKET_PRODUCTS.filter(p => p && !revokedProductIds.has(p.id));
    MARKET_PRODUCTS = cleanList;
    const json = JSON.stringify(cleanList);
    localStorage.setItem(STORAGE_KEYS.MARKET_PRODUCTS, json);
    sessionStorage.setItem(STORAGE_KEYS.MARKET_PRODUCTS, json);
    syncMyVendorListingsWithMarket();
  } catch {}
}

/**
 * Smart two-way merge between two product lists (localStorage & Server RAM / defaults).
 * Preserves all user-created products and the highest bidCount / currentBidXMR on every item.
 */
function mergeProductCatalogs(primaryList, secondaryList) {
  loadRevokedIdsFromStorage();
  const mergedMap = new Map();
  const orderedIds = [];

  const upsert = (item) => {
    if (!item || !item.id || revokedProductIds.has(item.id)) return;
    if (!mergedMap.has(item.id)) {
      mergedMap.set(item.id, { ...item });
      orderedIds.push(item.id);
    } else {
      const existing = mergedMap.get(item.id);
      const existingBids = Number(existing.bidCount || (existing.bids ? existing.bids.length : 0));
      const incomingBids = Number(item.bidCount || (item.bids ? item.bids.length : 0));
      const existingPrice = Number(existing.currentBidXMR || existing.rawPriceXMR || 0);
      const incomingPrice = Number(item.currentBidXMR || item.rawPriceXMR || 0);

      if (incomingBids > existingBids || (incomingBids === existingBids && incomingPrice > existingPrice)) {
        mergedMap.set(item.id, {
          ...existing,
          ...item,
          vendorKillToken: existing.vendorKillToken || item.vendorKillToken
        });
      } else if (!existing.vendorKillToken && item.vendorKillToken) {
        existing.vendorKillToken = item.vendorKillToken;
      }
    }
  };

  if (Array.isArray(primaryList)) primaryList.forEach(upsert);
  if (Array.isArray(secondaryList)) secondaryList.forEach(upsert);

  const result = orderedIds.map(id => mergedMap.get(id));
  result.sort((a, b) => {
    if (a.isUserCreated && !b.isUserCreated) return -1;
    if (!a.isUserCreated && b.isUserCreated) return 1;
    if (a.isUserCreated && b.isUserCreated) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return 0;
  });
  return result;
}

function loadMarketProductsFromStorage() {
  loadRevokedIdsFromStorage();
  try {
    const rawMarket = localStorage.getItem(STORAGE_KEYS.MARKET_PRODUCTS) || sessionStorage.getItem(STORAGE_KEYS.MARKET_PRODUCTS);
    if (rawMarket) {
      const storedList = JSON.parse(rawMarket);
      if (Array.isArray(storedList) && storedList.length > 0) {
        MARKET_PRODUCTS = mergeProductCatalogs(storedList, MARKET_PRODUCTS);
      }
    }
    const rawVendor = localStorage.getItem(STORAGE_KEYS.MY_LISTINGS) || sessionStorage.getItem(STORAGE_KEYS.MY_LISTINGS);
    if (rawVendor) {
      const vendorList = JSON.parse(rawVendor);
      if (Array.isArray(vendorList) && vendorList.length > 0) {
        MARKET_PRODUCTS = mergeProductCatalogs(vendorList, MARKET_PRODUCTS);
      }
    }
    MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p && !revokedProductIds.has(p.id));
  } catch {}
}

function saveChatMessagesToStorage() {
  if (isPurgingNow) return;
  try {
    const json = JSON.stringify(inMemoryChatMessages);
    localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, json);
    sessionStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, json);
  } catch {}
}

function saveActiveDealToStorage(deal) {
  if (isPurgingNow) return;
  try {
    if (deal) {
      const json = JSON.stringify(deal);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DEAL, json);
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_DEAL, json);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
    }
  } catch {}
}

function saveActiveOrderToStorage() {
  if (isPurgingNow) return;
  try {
    if (activeOrder) {
      const json = JSON.stringify(activeOrder);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ORDER, json);
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_ORDER, json);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
    }
  } catch {}
}

function initWorkspaceModulesOnce() {
  if (workspaceModulesReady) return;
  workspaceModulesReady = true;
  initPanicAndPurgeHooks();
  initTelemetryAndMask();
  initTabs();
  initVendorDesk();
  initMarketCatalog();
  initEncryptedChat();
  initOrderSystem();
  initAuctionBidding();
  initClosedCompanyModalsAndAdmin();
  bindV75ModalAndTeamForms();
  updateRamMonitor();
  checkUrlForP2PRoom();
}

document.addEventListener('DOMContentLoaded', () => {
  initCompanyBootFlow();
});

/* ==========================================================================
   1. EPHEMERAL IDENTITY & PURGE-ON-EXIT (ZERO-TRACE MANDATE)
   ========================================================================== */

function generateEphemeralIdentity(forceNew = false) {
  let storedAlias = null;
  try {
    storedAlias = localStorage.getItem(STORAGE_KEYS.ALIAS) || sessionStorage.getItem(STORAGE_KEYS.ALIAS);
  } catch {}

  if (storedAlias && !forceNew) {
    anonymousAlias = storedAlias;
  } else {
    const randHex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    anonymousAlias = `NV-${randHex}`;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.ALIAS, anonymousAlias);
    sessionStorage.setItem(STORAGE_KEYS.ALIAS, anonymousAlias);
  } catch {}

  const aliasEl = document.getElementById('anon-alias');
  if (aliasEl) {
    aliasEl.textContent = anonymousAlias;
  }
}

/**
 * PURGE ALL IN-MEMORY DATA:
 * Immediately zeros out variables, clears message logs, destroys active order,
 * flushes sessionStorage / localStorage, and leaves no residual footprints.
 */
function purgeAllVolatileData() {
  isPurgingNow = true;
  // Clear chat memory
  inMemoryChatMessages.length = 0;
  activeOrder = null;
  myVendorListings.length = 0;
  revokedProductIds.clear();

  if (orderCountdownTimer) {
    clearInterval(orderCountdownTimer);
    orderCountdownTimer = null;
  }

  // Clear DOM chat
  const chatList = document.getElementById('chat-message-list');
  if (chatList) chatList.innerHTML = '';

  // Clear inputs
  const chatInput = document.getElementById('chat-input-field');
  if (chatInput) chatInput.value = '';

  const orderKeyInput = document.getElementById('order-receiver-pubkey');
  if (orderKeyInput) orderKeyInput.value = '';

  // Flush browser storages completely
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {}

  // Flush clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText('').catch(() => {});
  }

  // Terminate active WebRTC P2P connection and destroy peer
  disconnectP2P(false);

  renderMyListings();
  updateRamMonitor();
}

let lastModalTriggerEl = null;

function getModalFocusableElements(overlayEl) {
  if (!overlayEl) return [];
  return Array.from(
    overlayEl.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter(el => el.offsetParent !== null);
}

function openAccessibleModal(overlayEl, focusSelector = null) {
  if (!overlayEl) return;
  lastModalTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shell = document.querySelector('.vault-shell');
  if (shell) {
    shell.inert = true;
    shell.setAttribute('aria-hidden', 'true');
  }
  overlayEl.style.display = 'flex';
  const focusTarget = focusSelector ? overlayEl.querySelector(focusSelector) : null;
  const dialog = overlayEl.querySelector('[role="dialog"]');
  setTimeout(() => {
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    } else if (dialog && typeof dialog.focus === 'function') {
      dialog.focus();
    }
  }, 20);
}

function closeAccessibleModal(overlayEl) {
  if (!overlayEl) return;
  overlayEl.style.display = 'none';
  const shell = document.querySelector('.vault-shell');
  if (shell) {
    shell.inert = false;
    shell.removeAttribute('aria-hidden');
  }
  if (lastModalTriggerEl && typeof lastModalTriggerEl.focus === 'function') {
    lastModalTriggerEl.focus();
    lastModalTriggerEl = null;
  }
}

function initPanicAndPurgeHooks() {
  const panicBtn = document.getElementById('panic-btn');
  const brandBtn = document.getElementById('brand-scroll-top-btn');
  const vaultHeader = document.querySelector('.vault-header');

  const scrollToTopSmooth = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (document.documentElement) {
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (document.body) {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (brandBtn) {
    brandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollToTopSmooth();
    });
  }

  if (vaultHeader) {
    vaultHeader.addEventListener('click', (e) => {
      if (e.target.closest('.vault-actions') || e.target.closest('button')) return;
      scrollToTopSmooth();
    });
  }

  // Accessible banner dismiss binding (replaces inline onclick)
  document.querySelectorAll('.dismiss-banner-btn[data-dismiss]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-dismiss');
      const banner = targetId ? document.getElementById(targetId) : null;
      if (banner) banner.style.display = 'none';
    });
  });

  const executeSessionReset = async () => {
    await logoutCompanySession('Đã xóa dữ liệu tạm trên trình duyệt và kết thúc phiên.');
  };

  if (panicBtn) {
    panicBtn.addEventListener('click', executeSessionReset);
  }

  // Modal Escape handling & Tab Focus Trap
  window.addEventListener('keydown', (e) => {
    const modalIds = [
      'create-room-modal-overlay',
      'change-pwd-modal-overlay',
      'assign-task-modal-overlay',
      'bid-modal-overlay',
      'qr-modal-overlay'
    ];
    let openModal = null;
    for (const id of modalIds) {
      const el = document.getElementById(id);
      if (el && el.style.display !== 'none') {
        openModal = el;
        break;
      }
    }
    const bidModal = document.getElementById('bid-modal-overlay');

    if (!openModal) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (openModal === bidModal) activeBiddingProductId = null;
      closeAccessibleModal(openModal);
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getModalFocusableElements(openModal);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !openModal.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !openModal.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/* ==========================================================================
   2. TELEMETRY & SESSION CLOCK
   ========================================================================== */

function initTelemetryAndMask() {
  // Restore session clock from storage if available
  try {
    const savedSecs = parseInt(sessionStorage.getItem(STORAGE_KEYS.SESSION_SECONDS) || '0', 10);
    if (!isNaN(savedSecs) && savedSecs > 0) {
      sessionSeconds = savedSecs;
    }
  } catch {}

  const clockEl = document.getElementById('session-timer');
  if (clockEl) {
    const renderClock = () => {
      const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
      const secs = String(sessionSeconds % 60).padStart(2, '0');
      clockEl.textContent = `${mins}:${secs}`;
    };
    renderClock();

    setInterval(() => {
      sessionSeconds++;
      renderClock();
      try {
        sessionStorage.setItem(STORAGE_KEYS.SESSION_SECONDS, String(sessionSeconds));
      } catch {}
    }, 1000);
  }

  // Regenerate Alias Button
  const regenBtn = document.getElementById('regen-alias-btn');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      generateEphemeralIdentity(true);
      showToast(`Đã cập nhật mã thành viên phiên: ${anonymousAlias}`, 'info');
    });
  }

  // QR Modal Close
  const closeQrBtn = document.getElementById('close-qr-btn');
  const qrOverlay = document.getElementById('qr-modal-overlay');
  if (closeQrBtn && qrOverlay) {
    closeQrBtn.addEventListener('click', () => {
      closeAccessibleModal(qrOverlay);
    });
  }
  if (qrOverlay) {
    qrOverlay.addEventListener('click', (e) => {
      if (e.target === qrOverlay) closeAccessibleModal(qrOverlay);
    });
  }
}

/* ==========================================================================
   3. TABS MANAGEMENT
   ========================================================================== */

function initTabs() {
  const navTabs = Array.from(document.querySelectorAll('.covert-nav-tabs .nav-tab'));
  navTabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
    tab.addEventListener('keydown', (e) => {
      let nextIdx = -1;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % navTabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + navTabs.length) % navTabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = navTabs.length - 1;
      if (nextIdx !== -1) {
        e.preventDefault();
        const nextTab = navTabs[nextIdx];
        nextTab.focus();
        switchTab(nextTab.getAttribute('data-tab'));
      }
    });
  });

  // Restore last active tab on F5 reload
  try {
    const savedTab = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
    if (savedTab && document.getElementById(savedTab)) {
      switchTab(savedTab);
    }
  } catch {}
}

function switchTab(tabId) {
  if (isCompanyAuthActive()) {
    const role = currentCompanyState.user.role;
    if (tabId === 'tab-vendor' && role === 'employee') {
      showToast('Nhân viên chỉ có quyền xem dự án của phòng ban mình.', 'warning');
      tabId = 'tab-market';
    }
    if (tabId === 'tab-team' && role === 'employee') {
      showToast('Nhân viên không có quyền truy cập mục Nhân Sự & Ban.', 'warning');
      tabId = 'tab-market';
    }
    if (tabId === 'tab-admin' && role !== 'director') {
      showToast('Chỉ Giám đốc mới có quyền truy cập Bảng Điều Hành Giám Đốc.', 'warning');
      tabId = 'tab-market';
    }
  }
  const navTabs = document.querySelectorAll('.covert-nav-tabs .nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach(t => {
    const isSelected = t.getAttribute('data-tab') === tabId;
    t.classList.toggle('active', isSelected);
    t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (document.body) {
    document.body.classList.toggle('chat-tab-active', tabId === 'tab-chat');
  }

  if (!isPurgingNow && tabId) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tabId);
    } catch {}
  }

  // Clear unread badge if opening chat
  if (tabId === 'tab-chat') {
    const chatBadge = document.getElementById('chat-badge');
    if (chatBadge) chatBadge.style.display = 'none';
    renderMessengerThreads();
    updateActiveThreadHeader();
    renderChatMessages();
    setTimeout(() => {
      const input = document.getElementById('chat-input-field');
      input?.focus();
    }, 50);
  }

  updateRamMonitor();
}

/* ==========================================================================
   4. ANONYMOUS PRODUCT CATALOG & FILTERING
   ========================================================================== */

function formatPriceNum(val) {
  const num = Number(val);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Cross-tab real-time broadcast channel for instantaneous multi-desk synchronization
const bazaarSyncChannel = (typeof window !== 'undefined' && 'BroadcastChannel' in window)
  ? new BroadcastChannel('ghost_bazaar_catalog_sync_v1')
  : null;

/**
 * Fetch synchronized product catalog from volatile server RAM and merge with local state
 */
async function fetchBazaarProducts(silent = true) {
  if (companyAuthToken) {
    return fetchCompanyState(silent);
  }
  loadMarketProductsFromStorage();
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-items', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && Array.isArray(json.soldOrRevokedIds)) {
      let newlySoldOnServer = false;
      json.soldOrRevokedIds.forEach(soldId => {
        if (soldId && !revokedProductIds.has(soldId)) {
          addRevokedProductId(soldId);
          newlySoldOnServer = true;
        }
      });
      if (newlySoldOnServer) {
        MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p && !revokedProductIds.has(p.id));
        myVendorListings = myVendorListings.filter(p => p && !revokedProductIds.has(p.id));
        saveMyVendorListingsToStorage();
        saveMarketProductsToStorage();
      }
    }
    if (json && Array.isArray(json.data)) {
      const serverItems = json.data.filter(p => p && !revokedProductIds.has(p.id));
      const serverIds = new Set(serverItems.map(p => p.id));

      // Re-push any locally created user items that the server doesn't have yet (e.g. after server restart)
      const localOnlyUserItems = MARKET_PRODUCTS.filter(
        p => p && p.isUserCreated && !serverIds.has(p.id) && !revokedProductIds.has(p.id)
      );
      localOnlyUserItems.forEach(item => {
        bazaarApiFetch('/api/lexicon/bazaar-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        }).catch(() => {});
      });

      MARKET_PRODUCTS = mergeProductCatalogs(MARKET_PRODUCTS, serverItems);
      saveMarketProductsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
      if (!silent) {
        showToast('Đã cập nhật bảng tin và tài nguyên mới nhất từ RAM!', 'success');
      }
    }
  } catch (err) {
    // Offline or Static Host (e.g. GitHub Pages): preserve and render local persisted catalog
    saveMarketProductsToStorage();
    updateCategoryPillCounts();
    populateOrderProductSelect(MARKET_PRODUCTS);
    filterAndRenderProducts();
    renderMyListings();
    updateRamMonitor();
    if (!silent) {
      showToast('Đã làm mới danh sách hạng mục công việc!', 'success');
    }
  }
}

function initMarketCatalog() {
  const searchInput = document.getElementById('market-search-input');
  const clearSearchBtn = document.getElementById('clear-market-search-btn');
  const sortSelect = document.getElementById('market-sort-select');
  const categoryPills = document.getElementById('market-category-pills');
  const quickOpenVendorBtn = document.getElementById('quick-open-vendor-btn');
  const refreshMarketBtn = document.getElementById('refresh-market-btn');

  saveMarketProductsToStorage();
  renderProducts(MARKET_PRODUCTS);
  updateCategoryPillCounts();
  populateOrderProductSelect(MARKET_PRODUCTS);
  updateOrderPreviewCard();

  // Cross-tab storage event listener (disabled in closed-company RBAC mode to prevent cross-role tab leakage)
  window.addEventListener('storage', (e) => {
    if (isCompanyAuthActive()) return;
    if (
      e.key === STORAGE_KEYS.MARKET_PRODUCTS ||
      e.key === STORAGE_KEYS.REVOKED_IDS ||
      e.key === STORAGE_KEYS.MY_LISTINGS
    ) {
      loadMarketProductsFromStorage();
      syncMyVendorListingsWithMarket();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    } else if (e.key === STORAGE_KEYS.ACTIVE_DEAL) {
      if (!e.newValue) {
        if (activeAutoDeal) {
          executeLocalDealAutoBurn(activeAutoDeal.dealId, true);
        }
      } else {
        try {
          const dealObj = JSON.parse(e.newValue);
          if (dealObj && dealObj.status === 'completed_burned') {
            executeLocalDealAutoBurn(dealObj.dealId, true);
          } else if (dealObj && dealObj.dealId) {
            applyIncomingBlindDealState(dealObj);
          }
        } catch {}
      }
    }
  });

  // Cross-tab real-time sync listener (disabled in closed-company RBAC mode; WS /ws/company handles scoped sync)
  if (bazaarSyncChannel) {
    bazaarSyncChannel.onmessage = (event) => {
      if (isCompanyAuthActive()) return;
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'NEW_PRODUCT') {
        const prod = msg.product;
        const idx = MARKET_PRODUCTS.findIndex(p => p.id === prod.id);
        if (idx === -1) {
          MARKET_PRODUCTS.unshift(prod);
        } else {
          MARKET_PRODUCTS[idx] = prod;
        }
        saveMarketProductsToStorage();
        updateCategoryPillCounts();
        populateOrderProductSelect(MARKET_PRODUCTS);
        filterAndRenderProducts();
        renderMyListings();
        updateRamMonitor();
        showToast(`📢 Bảng tin công ty vừa có mục mới: "${prod.name}"!`, 'info');
      } else if (msg.type === 'BID_PLACED') {
        const prod = MARKET_PRODUCTS.find(p => p.id === msg.productId);
        if (prod) {
          prod.currentBidXMR = msg.amount;
          prod.rawPriceXMR = msg.amount;
          prod.highestBidder = msg.bidder;
          prod.bidCount = (prod.bidCount || 0) + 1;
          prod.priceXMR = `${formatPriceNum(msg.amount)} ${msg.currency || prod.currency || 'XMR'}`;
          prod.approxUSD = estimateUSDString(msg.amount, msg.currency || prod.currency || 'XMR');
          if (!prod.bids) prod.bids = [];
          prod.bids.unshift({
            bidder: msg.bidder,
            amount: msg.amount,
            currency: msg.currency || 'XMR',
            note: 'Dẫn đầu',
            time: 'Vừa xong'
          });
          saveMarketProductsToStorage();
          filterAndRenderProducts();
          renderMyListings();
          updateRamMonitor();
          showToast(`✋ "${prod.name}" có đề xuất mới: ${msg.amount} ${msg.currency || 'Giờ'} từ ${msg.bidder}!`, 'info');
        }
      } else if (msg.type === 'REVOKE_PRODUCT') {
        addRevokedProductId(msg.productId);
        MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== msg.productId);
        myVendorListings = myVendorListings.filter(p => p.id !== msg.productId);
        saveMarketProductsToStorage();
        saveMyVendorListingsToStorage();
        updateCategoryPillCounts();
        populateOrderProductSelect(MARKET_PRODUCTS);
        filterAndRenderProducts();
        renderMyListings();
        updateRamMonitor();
      } else if (msg.type === 'DEAL_SYNC' && msg.deal) {
        applyIncomingBlindDealState(msg.deal);
      } else if (msg.type === 'DEAL_COMPLETED_BURN') {
        executeLocalDealAutoBurn(msg.dealId, true, msg.productId || '', msg.productName || '');
      }
    };
  }

  // Auto-sync when user switches back to this desk or window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && companyAuthToken) {
      fetchCompanyState(true);
    }
  });
  window.addEventListener('focus', () => {
    if (companyAuthToken) {
      fetchCompanyState(true);
    }
  });

  if (refreshMarketBtn) {
    refreshMarketBtn.addEventListener('click', () => {
      if (companyAuthToken) {
        fetchCompanyState(false);
      } else {
        fetchBazaarProducts(false);
      }
    });
  }

  if (quickOpenVendorBtn) {
    quickOpenVendorBtn.addEventListener('click', () => {
      switchTab('tab-vendor');
      document.getElementById('listing-name')?.focus();
    });
  }

  const viewGridBtn = document.getElementById('view-grid-btn');
  const viewListBtn = document.getElementById('view-list-btn');
  const productGridEl = document.getElementById('market-product-grid');
  const applyViewMode = (mode) => {
    const isList = mode === 'list';
    if (productGridEl) productGridEl.classList.toggle('list-mode', isList);
    if (viewGridBtn) {
      viewGridBtn.classList.toggle('active', !isList);
      viewGridBtn.setAttribute('aria-pressed', isList ? 'false' : 'true');
    }
    if (viewListBtn) {
      viewListBtn.classList.toggle('active', isList);
      viewListBtn.setAttribute('aria-pressed', isList ? 'true' : 'false');
    }
    try {
      sessionStorage.setItem('nexus_view_mode_v1', isList ? 'list' : 'grid');
    } catch {}
  };
  try {
    if (sessionStorage.getItem('nexus_view_mode_v1') === 'list') {
      applyViewMode('list');
    }
  } catch {}
  if (viewGridBtn) viewGridBtn.addEventListener('click', () => applyViewMode('grid'));
  if (viewListBtn) viewListBtn.addEventListener('click', () => applyViewMode('list'));

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
      }
      filterAndRenderProducts();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      filterAndRenderProducts();
      searchInput?.focus();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      filterAndRenderProducts();
    });
  }

  const taskFilterSelect = document.getElementById('market-task-filter-select');
  if (taskFilterSelect) {
    taskFilterSelect.addEventListener('change', () => {
      filterAndRenderProducts();
    });
  }

  if (categoryPills) {
    categoryPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.market-pill');
      if (pill) {
        document.querySelectorAll('.market-pill').forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-pressed', 'true');
        filterAndRenderProducts();
      }
    });
  }

  // Quick '/' shortcut to focus market search bar
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      switchTab('tab-market');
      searchInput?.focus();
    }
  });
}

const DEPT_DISPLAY_META = {
  devops: { badge: 'Ban DevOps', category: 'hardware' },
  admin_it: { badge: 'Hành chính IT', category: 'physical' },
  network: { badge: 'Mạng & An ninh', category: 'network' },
  finance: { badge: 'Tài chính', category: 'audit' }
};

function getPriorityBadgeClass(secLevel) {
  const s = String(secLevel || '').toLowerCase();
  if (s.includes('khẩn')) return 'prio-urgent';
  if (s.includes('cao')) return 'prio-high';
  if (s.includes('mật')) return 'prio-secret';
  return 'prio-normal';
}

function updateCategoryPillCounts() {
  const countAll = document.getElementById('count-all');
  if (countAll) countAll.textContent = MARKET_PRODUCTS.length;

  ['devops', 'admin_it', 'network', 'finance'].forEach(deptId => {
    const el = document.getElementById(`count-${deptId}`);
    if (el) el.textContent = MARKET_PRODUCTS.filter(p => p.department === deptId).length;
  });
}

function filterAndRenderProducts() {
  const query = (document.getElementById('market-search-input')?.value || '').trim().toLowerCase();
  const activePill = document.querySelector('.market-pill.active');
  const category = activePill ? activePill.getAttribute('data-category') : 'all';
  const sort = document.getElementById('market-sort-select')?.value || 'default';
  const taskFilter = document.getElementById('market-task-filter-select')?.value || 'all';

  let filtered = [...MARKET_PRODUCTS];

  if (taskFilter !== 'all') {
    filtered = filtered.filter(p => (p.taskStatus || 'todo') === taskFilter);
  }

  if (category !== 'all') {
    filtered = filtered.filter(p => p.department === category || p.category === category);
  }

  if (query) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.desc.toLowerCase().includes(query) ||
      (p.badge && p.badge.toLowerCase().includes(query)) ||
      (p.assigneeName && p.assigneeName.toLowerCase().includes(query)) ||
      (p.securityLevel && p.securityLevel.toLowerCase().includes(query)) ||
      Object.values(p.specs || {}).some(val => String(val).toLowerCase().includes(query))
    );
  }

  // Sorting
  if (sort === 'status') {
    const rank = { in_progress: 0, review: 1, todo: 2, done: 3 };
    filtered.sort((a, b) => (rank[a.taskStatus || 'todo'] ?? 9) - (rank[b.taskStatus || 'todo'] ?? 9));
  } else if (sort === 'price-asc') {
    filtered.sort((a, b) => (a.rawPriceXMR || 0) - (b.rawPriceXMR || 0));
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => (b.rawPriceXMR || 0) - (a.rawPriceXMR || 0));
  } else if (sort === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderProducts(filtered);
  updateCategoryPillCounts();
}

const SVG_ICONS = {
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  chat: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  link: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
  search: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
};

function renderProducts(products) {
  const grid = document.getElementById('market-product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-recovery-box" style="grid-column: 1 / -1;">
        <div class="empty-icon">${SVG_ICONS.search}</div>
        <h3 class="empty-title">Không tìm thấy dự án phù hợp</h3>
        <p class="empty-desc">Thử thay đổi từ khóa tìm kiếm, bộ lọc trạng thái hoặc khởi tạo dự án mới trong phòng ban.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(item => {
    const currency = item.currency || 'Giờ';
    const deptMeta = DEPT_DISPLAY_META[item.department] || null;
    const badgeCategory = escapeHtml(item.category || deptMeta?.category || 'hardware');
    const badgeText = escapeHtml(item.badge || deptMeta?.badge || 'Nội bộ công ty');
    const priorityText = item.securityLevel || 'Ưu tiên Trung bình';
    const priorityClass = getPriorityBadgeClass(priorityText);

    const topRightBadge = `
      <div class="project-priority-group">
        <span class="project-priority-pill ${priorityClass}">${escapeHtml(priorityText)}</span>
        ${item.dueDate ? `<span class="project-due-pill">${SVG_ICONS.clock} ${escapeHtml(item.dueDate)}</span>` : ''}
      </div>
    `;

    const workloadVal = item.rawPriceXMR ?? item.currentBidXMR ?? 0;
    const priceDisplay = `${formatPriceNum(workloadVal)} ${escapeHtml(currency)}`;
    const priceMeta = 'Khối lượng ước lượng';
    const specValues = Object.values(item.specs || {}).slice(0, 2).map(v => escapeHtml(v)).join(' · ');
    const taskStateKey = item.taskStatus || 'todo';
    const taskStateLabel = TASK_STATUS_LABELS_VI[taskStateKey] || 'Mới';
    const assigneeLine = item.assigneeName
      ? `<span>Phụ trách: <strong>${escapeHtml(item.assigneeName)}</strong></span>`
      : '<span>Chưa phân công người phụ trách</span>';

    const taskStatusBar = isCompanyAuthActive()
      ? `<div class="project-task-meta-row">
           <span class="task-status-badge status-${escapeHtml(taskStateKey)}">${escapeHtml(taskStateLabel)}</span>
           <span class="task-assignee-text">${assigneeLine}</span>
         </div>`
      : '';

    const canManageProj = isCompanyAuthActive() && (currentCompanyState.user.role === 'director' || currentCompanyState.user.role === 'manager');
    const taskBtnHtml = isCompanyAuthActive()
      ? `<button type="button" class="assign-task-btn" data-id="${escapeHtml(item.id)}" title="${canManageProj ? 'Giao việc & cập nhật tiến độ' : 'Cập nhật tiến độ công việc'}">
           ${SVG_ICONS.edit} <span>${canManageProj ? 'Giao việc' : 'Tiến độ'}</span>
         </button>`
      : '';
    const deleteProjHtml = canManageProj
      ? `<button type="button" class="delete-proj-btn" data-id="${escapeHtml(item.id)}" aria-label="Thu hồi dự án ${escapeHtml(item.name)}" title="Thu hồi dự án khỏi bảng tin">
           ${SVG_ICONS.trash}
         </button>`
      : '';

    const actionButtons = `
      ${taskBtnHtml}
      <button type="button" class="buy-btn" data-id="${escapeHtml(item.id)}" title="Mở bàn giao thông tin mật AES-256-GCM cho dự án này">
        ${SVG_ICONS.check} <span>Bàn giao</span>
      </button>
      <button type="button" class="chat-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" aria-label="Mở kênh thảo luận nội bộ cho ${escapeHtml(item.name)}" title="Thảo luận nội bộ">
        ${SVG_ICONS.chat}
      </button>
      ${deleteProjHtml}
    `;

    return `
      <article class="product-card" id="card-${escapeHtml(item.id)}">
        <div class="product-card-top">
          <div class="product-badge-group">
            <span class="dept-chip ${badgeCategory}">
              <span class="dept-dot" aria-hidden="true"></span>
              ${badgeText}
            </span>
          </div>
          ${topRightBadge}
        </div>

        <div class="product-main-body">
          <div class="product-title-row">
            <div class="product-icon-box" aria-hidden="true">${escapeHtml(item.icon)}</div>
            <h3 class="product-title">${escapeHtml(item.name)}</h3>
          </div>
          <p class="product-desc">${escapeHtml(item.desc)}</p>
          ${taskStatusBar}
          ${specValues ? `<p class="product-specs-inline">${specValues}</p>` : ''}
        </div>

        <div class="product-card-footer">
          <div class="product-price-block">
            <span class="product-price auction-price">${priceDisplay}</span>
            <span class="product-bid-meta">${priceMeta}</span>
          </div>
          <div class="product-actions">
            ${actionButtons}
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Bind Handover, Chat, Assign Task & Delete Project buttons
  grid.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      initiateOrderForProduct(prodId);
    });
  });

  grid.querySelectorAll('.chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodName = btn.getAttribute('data-name');
      const prodId = btn.getAttribute('data-id') || '';
      initiateChatForProduct(prodName, prodId);
    });
  });

  grid.querySelectorAll('.assign-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      if (prodId) openAssignTaskModal(prodId);
    });
  });

  grid.querySelectorAll('.delete-proj-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const prodId = btn.getAttribute('data-id');
      const prod = MARKET_PRODUCTS.find(p => p.id === prodId);
      if (!prodId || !window.confirm(`Thu hồi dự án "${prod?.name || prodId}" khỏi hệ thống?`)) return;
      const res = await bazaarApiFetch(`/api/company/projects/${encodeURIComponent(prodId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không có quyền thu hồi dự án.', 'error');
        return;
      }
      showToast('Đã thu hồi dự án thành công!', 'success');
      await fetchCompanyState(true);
    });
  });
}

function populateOrderProductSelect(products) {
  const select = document.getElementById('order-product-select');
  if (!select) return;

  select.innerHTML = products.map(p => `
    <option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.priceXMR)} (${escapeHtml(p.approxUSD)})</option>
  `).join('');
}

function updateOrderPreviewCard() {
  const previewBox = document.getElementById('live-order-preview-card');
  const select = document.getElementById('order-product-select');
  if (!previewBox || !select) return;

  const prodId = select.value;
  const product = MARKET_PRODUCTS.find(p => p.id === prodId) || MARKET_PRODUCTS[0];

  previewBox.innerHTML = `
    <div class="preview-card-header">
      <div class="preview-icon-box" aria-hidden="true">${escapeHtml(product.icon)}</div>
      <div>
        <h4 class="preview-title">${escapeHtml(product.name)}</h4>
        <span class="preview-badge">${escapeHtml(product.badge)} · ${escapeHtml(product.securityLevel)}</span>
      </div>
    </div>
    <div class="preview-price-row">
      <span class="detail-label">Quy mô / Số lượng tiếp nhận:</span>
      <span class="preview-price-val">${escapeHtml(product.priceXMR)}</span>
    </div>
    <p class="product-specs-inline">Drop ID Tự Hủy RAM · Mã hóa AES-256-GCM + PGP Key</p>
  `;
}

function initiateOrderForProduct(productId) {
  const select = document.getElementById('order-product-select');
  if (select) {
    select.value = productId;
    updateOrderPreviewCard();
  }
  switchTab('tab-order');
  showToast('Đã nạp hạng mục vào Phiếu Bàn Giao Nội Bộ!', 'info');
}

function initiateChatForProduct(productName, productId = '') {
  if (isCompanyAuthActive()) {
    switchTab('tab-chat');
    const prod = MARKET_PRODUCTS.find(p => p.id === productId);
    const matchingRoom = chatThreads.find(t => t.projectId && t.projectId === productId)
      || chatThreads.find(t => prod && t.department === prod.department && t.status === 'active')
      || chatThreads.find(t => t.status === 'active')
      || chatThreads[0];
    if (matchingRoom) {
      selectMessengerThread(matchingRoom.id);
      const input = document.getElementById('chat-input-field');
      if (input && !input.disabled) {
        input.value = `Trao đổi về dự án "${productName}": `;
        input.focus();
      }
    } else {
      showToast('Ban của bạn chưa có phòng chat hoạt động nào.', 'info');
    }
    return;
  }

  currentChatInquiry = productName;
  const tag = document.getElementById('active-product-tag');
  if (tag) tag.textContent = `Về: ${productName}`;

  switchTab('tab-chat');

  // Auto-generate Ephemeral Blind Deal Session Code & connect Buyer <-> Seller automatically
  startAutoBlindDeal(productName, productId);

  const input = document.getElementById('chat-input-field');
  if (input) {
    input.value = `Chào bạn, mình cần trao đổi và tiếp nhận hạng mục "${productName}". Nhờ bạn chia sẻ thông tin bàn giao qua kênh này nhé!`;
    input.focus();
  }
}

/* ==========================================================================
   5. SERVERLESS WEBRTC P2P DIRECT CHAT (ZERO-SERVER • ZERO-LOG)
   ========================================================================== */

function generateRoomCode() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `TEAM-${rand}`;
}

function getRoomShareableLink(code) {
  const baseUrl = window.location.href.split('#')[0];
  return `${baseUrl}#room=${encodeURIComponent(code)}`;
}

function updateP2PStatusUI(state, extraInfo = null) {
  const pulseDot = document.getElementById('p2p-pulse-dot');
  const statusText = document.getElementById('p2p-status-text');
  const setupRow = document.getElementById('p2p-setup-row');
  const activeRow = document.getElementById('p2p-active-row');
  const roomCodeDisplay = document.getElementById('display-room-code');

  const avatarText = document.getElementById('chat-peer-avatar-text');
  const peerName = document.getElementById('chat-peer-name');
  const peerBadge = document.getElementById('chat-peer-badge');
  const peerStat = document.getElementById('chat-peer-stat');
  const peerPing = document.getElementById('chat-peer-ping');

  if (state === 'disconnected') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot disconnected';
    if (statusText) statusText.textContent = 'Trợ lý nội bộ (Chưa nối máy P2P)';
    if (setupRow) setupRow.style.display = 'flex';
    if (activeRow) activeRow.style.display = 'none';

    if (avatarText) avatarText.textContent = 'N';
    if (peerName) peerName.textContent = 'Trợ Lý Điều Phối Nội Bộ';
    if (peerBadge) {
      peerBadge.textContent = 'Đã xác thực nội bộ';
      peerBadge.className = 'verified-vendor-badge';
    }
    if (peerStat) peerStat.textContent = '★ 5.0 (98 giao dịch)';
    if (peerPing) {
      peerPing.textContent = 'Phản hồi < 1p';
      peerPing.className = 'peer-stat green';
    }
  } else if (state === 'hosting') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot waiting';
    if (statusText) statusText.textContent = `Đang mở phòng [${extraInfo}] · Chờ đồng nghiệp tham gia...`;
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';
    if (roomCodeDisplay) roomCodeDisplay.textContent = extraInfo;
  } else if (state === 'connecting') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot waiting';
    if (statusText) statusText.textContent = `Đang kết nối WebRTC tới phòng [${extraInfo}]...`;
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';
    if (roomCodeDisplay) roomCodeDisplay.textContent = extraInfo;
  } else if (state === 'connected') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot connected';
    if (statusText) statusText.textContent = 'Đã kết nối P2P trực tiếp (Máy ↔ Máy)';
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';

    const partnerName = extraInfo?.peerAlias || p2pPeerAlias || 'Đồng nghiệp P2P';
    if (avatarText) avatarText.textContent = partnerName.charAt(0).toUpperCase();
    if (peerName) peerName.textContent = partnerName;
    if (peerBadge) {
      peerBadge.textContent = 'WebRTC Direct (Zero-Server)';
      peerBadge.className = 'verified-vendor-badge p2p-connected-badge';
    }
    if (peerStat) peerStat.textContent = 'Kênh Dữ Liệu E2EE Máy ↔ Máy';
    if (peerPing) {
      peerPing.textContent = 'Độ trễ < 50ms';
      peerPing.className = 'peer-stat green';
    }
  }
}

function startHostingP2PRoom(customCode = null) {
  if (!window.Peer) {
    showToast('Lỗi: Thư viện WebRTC PeerJS chưa được tải!', 'error');
    return;
  }

  disconnectP2P(false);

  const roomCode = (customCode || generateRoomCode()).toUpperCase().trim();
  currentRoomCode = roomCode;
  isRoomHost = true;

  const peerId = `ghbazaar-${roomCode.toLowerCase()}`;
  updateP2PStatusUI('hosting', roomCode);

  try {
    peerInstance = new window.Peer(peerId, PEERJS_CONFIG);
  } catch (err) {
    console.error('PeerJS init error:', err);
    showToast('Không thể khởi tạo WebRTC: ' + err.message, 'error');
    updateP2PStatusUI('disconnected');
    return;
  }

  peerInstance.on('open', () => {
    updateP2PStatusUI('hosting', roomCode);
    showToast(`Đã mở phòng họp P2P [${roomCode}]! Gửi link cho đồng nghiệp để trao đổi trực tiếp.`, 'success');

    inMemoryChatMessages.push({
      author: 'HỆ THỐNG P2P',
      role: 'system',
      time: getCurrentTimeStr(),
      text: `🔔 Phòng thảo luận nội bộ P2P [${roomCode}] đã sẵn sàng trên RAM. Gửi link mời cho đồng nghiệp để trao đổi trực tiếp máy-tới-máy!`
    });
    renderChatMessages();
    updateRamMonitor();
  });

  peerInstance.on('connection', (conn) => {
    setupP2PConnection(conn);
  });

  peerInstance.on('error', (err) => {
    console.error('PeerJS error:', err);
    if (err.type === 'unavailable-id') {
      showToast(`Mã phòng [${roomCode}] đang bận. Đang sinh mã phòng mới...`, 'warning');
      startHostingP2PRoom();
    } else {
      showToast('Lỗi WebRTC: ' + (err.message || err.type), 'error');
      updateP2PStatusUI('disconnected');
    }
  });
}

function joinP2PRoom(rawInput) {
  if (!window.Peer) {
    showToast('Lỗi: Thư viện WebRTC PeerJS chưa được tải!', 'error');
    return;
  }

  let code = (rawInput || '').trim();
  const hashMatch = code.match(/room=([A-Za-z0-9-_]+)/i);
  if (hashMatch) {
    code = hashMatch[1];
  }
  code = code.replace(/[^A-Za-z0-9-_]/g, '').toUpperCase();
  if (!code) {
    showToast('Vui lòng nhập mã phòng hợp lệ (ví dụ: GHOST-8F4A)!', 'warning');
    return;
  }

  disconnectP2P(false);

  currentRoomCode = code;
  isRoomHost = false;
  updateP2PStatusUI('connecting', code);

  const targetPeerId = `ghbazaar-${code.toLowerCase()}`;
  const myClientId = `ghbazaar-c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    peerInstance = new window.Peer(myClientId, PEERJS_CONFIG);
  } catch (err) {
    console.error('PeerJS init error:', err);
    showToast('Không thể kết nối WebRTC: ' + err.message, 'error');
    updateP2PStatusUI('disconnected');
    return;
  }

  peerInstance.on('open', () => {
    const conn = peerInstance.connect(targetPeerId, { reliable: true });
    setupP2PConnection(conn);
  });

  peerInstance.on('error', (err) => {
    console.error('PeerJS error:', err);
    showToast(`Không thể kết nối tới phòng [${code}]: Mã phòng không tồn tại hoặc chủ phòng đã đóng.`, 'error');
    updateP2PStatusUI('disconnected');
  });
}

function setupP2PConnection(conn) {
  activePeerConnection = conn;

  conn.on('open', () => {
    isP2PConnected = true;
    updateP2PStatusUI('connected', { peerAlias: p2pPeerAlias });
    playNotificationChime();

    // Send handshake packet with local alias
    conn.send({
      type: 'handshake',
      alias: anonymousAlias || 'Ẩn Danh',
      time: getCurrentTimeStr()
    });

    // Exchange custom vendor listings with remote peer
    const myCustomListings = MARKET_PRODUCTS.filter(p => p.isUserCreated);
    if (myCustomListings.length > 0) {
      try {
        conn.send({
          type: 'market_sync_batch',
          products: myCustomListings
        });
      } catch {}
    }

    inMemoryChatMessages.push({
      author: 'HỆ THỐNG P2P',
      role: 'system',
      time: getCurrentTimeStr(),
      text: '🎉 ĐÃ THIẾT LẬP KẾT NỐI P2P THÀNH CÔNG! Hai thiết bị hiện đang giao tiếp trực tiếp qua WebRTC DataChannel (máy ↔ máy). Hoàn toàn không qua máy chủ, không lưu log.'
    });
    renderChatMessages();
    updateRamMonitor();
    showToast('Đã kết nối P2P trực tiếp với máy đối tác!', 'success');
  });

  conn.on('data', (packet) => {
    if (!packet || typeof packet !== 'object') return;

    if (packet.type === 'handshake') {
      if (packet.alias) {
        p2pPeerAlias = packet.alias;
        updateP2PStatusUI('connected', { peerAlias: p2pPeerAlias });
      }
    } else if (packet.type === 'chat') {
      playNotificationChime();
      const p2pMsg = {
        author: packet.alias || p2pPeerAlias || 'Đối Tác',
        role: 'merchant',
        time: packet.time || getCurrentTimeStr(),
        text: packet.text
      };
      inMemoryChatMessages.push(p2pMsg);
      const activeTh = getActiveThread();
      if (activeTh) {
        if (!activeTh.messages) activeTh.messages = [];
        activeTh.messages.push(p2pMsg);
        activeTh.lastMessage = packet.text;
        activeTh.lastTime = p2pMsg.time;
      }
      renderMessengerThreads();
      renderChatMessages();
      updateRamMonitor();

      // Show unread badge if tab not active
      const activeTab = document.querySelector('.covert-nav-tabs .nav-tab.active');
      if (activeTab && activeTab.getAttribute('data-tab') !== 'tab-chat') {
        const badge = document.getElementById('chat-badge');
        if (badge) badge.style.display = 'inline-block';
      }
    } else if (packet.type === 'typing') {
      const typingIndicator = document.getElementById('chat-typing-indicator');
      const typingText = document.querySelector('#chat-typing-indicator .typing-text');
      if (typingIndicator) {
        if (packet.isTyping) {
          if (typingText) typingText.textContent = `${packet.alias || p2pPeerAlias || 'Đối tác'} đang soạn tin nhắn...`;
          typingIndicator.style.display = 'flex';
        } else {
          typingIndicator.style.display = 'none';
        }
      }
    } else if (packet.type === 'market_item_created') {
      const prod = packet.product;
      const idx = MARKET_PRODUCTS.findIndex(p => p.id === prod.id);
      if (idx === -1) {
        MARKET_PRODUCTS.unshift(prod);
      } else {
        MARKET_PRODUCTS[idx] = prod;
      }
      saveMarketProductsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
      playNotificationChime();
      showToast(`🔔 Đồng nghiệp vừa đăng mục mới: "${prod.name}"!`, 'info');
    } else if (packet.type === 'market_sync_batch' && Array.isArray(packet.products)) {
      MARKET_PRODUCTS = mergeProductCatalogs(MARKET_PRODUCTS, packet.products);
      saveMarketProductsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    } else if (packet.type === 'market_bid_placed') {
      const prod = MARKET_PRODUCTS.find(p => p.id === packet.productId);
      if (prod) {
        prod.currentBidXMR = packet.amount;
        prod.rawPriceXMR = packet.amount;
        prod.highestBidder = packet.bidder;
        prod.bidCount = (prod.bidCount || 0) + 1;
        prod.priceXMR = `${formatPriceNum(packet.amount)} ${packet.currency || prod.currency || 'XMR'}`;
        prod.approxUSD = estimateUSDString(packet.amount, packet.currency || prod.currency || 'XMR');
        if (!prod.bids) prod.bids = [];
        prod.bids.unshift({
          bidder: packet.bidder,
          amount: packet.amount,
          currency: packet.currency || 'XMR',
          time: 'Vừa xong'
        });
        saveMarketProductsToStorage();
        filterAndRenderProducts();
        renderMyListings();
        updateRamMonitor();
        playNotificationChime();
        showToast(`✋ Đồng nghiệp vừa gửi đề xuất ${packet.amount} ${packet.currency || ''} cho "${prod.name}"`, 'info');
      }
    } else if (packet.type === 'market_item_revoked') {
      addRevokedProductId(packet.productId);
      MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== packet.productId);
      myVendorListings = myVendorListings.filter(p => p.id !== packet.productId);
      saveMarketProductsToStorage();
      saveMyVendorListingsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    } else if (packet.type === 'disconnect') {
      showToast('Đối tác đã ngắt kết nối P2P!', 'warning');
      inMemoryChatMessages.push({
        author: 'HỆ THỐNG P2P',
        role: 'system',
        time: getCurrentTimeStr(),
        text: '⚠️ Đối tác đã chủ động ngắt kết nối P2P.'
      });
      renderChatMessages();
      disconnectP2P(true);
    }
  });

  conn.on('close', () => {
    if (isP2PConnected) {
      showToast('Kết nối P2P đã kết thúc.', 'info');
      inMemoryChatMessages.push({
        author: 'HỆ THỐNG P2P',
        role: 'system',
        time: getCurrentTimeStr(),
        text: '⚠️ Máy đối tác đã ngắt kết nối hoặc đóng tab trình duyệt.'
      });
      renderChatMessages();
      disconnectP2P(false);
    }
  });

  conn.on('error', (err) => {
    console.error('Conn error:', err);
    showToast('Lỗi truyền dữ liệu P2P: ' + (err.message || 'Lỗi không xác định'), 'error');
  });
}

function disconnectP2P(isRemote = false) {
  if (activePeerConnection) {
    if (!isRemote) {
      try {
        activePeerConnection.send({ type: 'disconnect' });
      } catch {}
    }
    try { activePeerConnection.close(); } catch {}
    activePeerConnection = null;
  }

  if (peerInstance) {
    try { peerInstance.destroy(); } catch {}
    peerInstance = null;
  }

  isP2PConnected = false;
  isRoomHost = false;
  currentRoomCode = null;
  p2pPeerAlias = 'Khách / Đối Tác';

  // Clear room hash from URL
  if (window.location.hash && window.location.hash.toLowerCase().includes('room=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  updateP2PStatusUI('disconnected');
}

function checkUrlForP2PRoom() {
  if (window.location.hash) {
    const match = window.location.hash.match(/room=([A-Za-z0-9-_]+)/i);
    if (match && match[1]) {
      const roomCode = match[1].toUpperCase();
      switchTab('tab-chat');
      setTimeout(() => {
        joinP2PRoom(roomCode);
      }, 400);
    }
  }
}

/* ==========================================================================
   5B. MESSENGER MULTI-THREAD CONVERSATION SYSTEM & ISOLATED BLIND DEALS
   (Mô hình Messenger Đa Hội Thoại • Tách biệt từng Người Mua & từng Sản Phẩm • Ẩn 100% ID & IP)
   ========================================================================== */

let chatThreads = [];
let activeThreadId = 'thread-merchant-general';
const seenDealNotifications = new Set();
const alreadyBurnedDeals = new Set();

function getActiveThread() {
  let thread = chatThreads.find(t => t.id === activeThreadId);
  if (!thread && chatThreads.length > 0) {
    thread = chatThreads[0];
    activeThreadId = thread.id;
  }
  return thread;
}

function loadChatThreadsFromStorage() {
  try {
    const raw = sessionStorage.getItem('nexus_threads_v3');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        chatThreads = parsed;
      }
    }
  } catch {}

  try {
    const savedId = sessionStorage.getItem('nexus_active_thread_v3');
    if (savedId && chatThreads.some(t => t.id === savedId)) {
      activeThreadId = savedId;
    }
  } catch {}

  if (chatThreads.length === 0) {
    chatThreads = [
      {
        id: 'thread-merchant-general',
        dealId: null,
        productId: 'general',
        productName: 'Kênh chung toàn công ty',
        peerAlias: 'Trợ Lý Điều Phối #BOT01',
        peerRole: 'merchant',
        avatarText: 'N',
        lastMessage: 'Kênh trao đổi nội bộ đã sẵn sàng trên RAM (AES-256-GCM)...',
        lastTime: getCurrentTimeStr(),
        unreadCount: 0,
        messages: [
          {
            id: 'msg-init-1',
            author: 'Trợ Lý Điều Phối',
            role: 'merchant',
            time: getCurrentTimeStr(),
            text: 'Chào đồng nghiệp! Kênh thảo luận nội bộ của Nexus Workspace đã được kích hoạt. Mọi tin nhắn và thông tin nhạy cảm (mật khẩu Server, API Key, cấu hình) trao đổi tại đây chỉ lưu tạm trong RAM, được mã hóa AES-256-GCM và tự động xóa sạch khi kết thúc phiên.'
          }
        ]
      }
    ];
    activeThreadId = 'thread-merchant-general';
  }

  const cur = getActiveThread();
  if (cur) inMemoryChatMessages = cur.messages;
}

function saveChatThreadsToStorage() {
  if (isPurgingNow) return;
  try {
    const json = JSON.stringify(chatThreads);
    sessionStorage.setItem('nexus_threads_v3', json);
    if (activeThreadId) {
      sessionStorage.setItem('nexus_active_thread_v3', activeThreadId);
    }
  } catch {}
}

function updateFloatingMessengerBadge() {
  const badge = document.getElementById('floating-messenger-badge');
  const chatTabBadge = document.getElementById('chat-badge');
  const totalUnread = chatThreads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);

  if (badge) {
    if (totalUnread > 0) {
      badge.textContent = String(totalUnread);
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  if (chatTabBadge) {
    if (totalUnread > 0) {
      chatTabBadge.textContent = String(totalUnread);
      chatTabBadge.style.display = 'inline-block';
    } else {
      chatTabBadge.style.display = 'none';
    }
  }
}

function renderMessengerThreads() {
  const container = document.getElementById('messenger-threads-list');
  const countBadge = document.getElementById('messenger-threads-count');
  if (countBadge) {
    countBadge.textContent = `${chatThreads.length} cuộc trò chuyện`;
  }
  if (!container) return;

  const searchInput = document.getElementById('messenger-thread-search');
  const filterKw = (searchInput?.value || '').trim().toLowerCase();

  const filtered = chatThreads.filter(t => {
    if (activeRoomFilter !== 'all') {
      if (activeRoomFilter === 'department' && t.scope !== 'department') return false;
      if (activeRoomFilter === 'work' && t.scope !== 'work') return false;
      if (activeRoomFilter === 'exec' && t.scope !== 'manager_to_manager' && t.scope !== 'manager_director') return false;
      if (activeRoomFilter === 'pending' && t.status !== 'pending_create' && t.status !== 'pending_delete') return false;
    }
    if (!filterKw) return true;
    return (t.peerAlias && t.peerAlias.toLowerCase().includes(filterKw)) ||
           (t.productName && t.productName.toLowerCase().includes(filterKw)) ||
           (t.lastMessage && t.lastMessage.toLowerCase().includes(filterKw)) ||
           (t.dealId && t.dealId.toLowerCase().includes(filterKw));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 1.5rem 1rem; text-align: center; color: #94a3b8; font-size: 0.8rem;">Không tìm thấy cuộc trò chuyện nào</div>`;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isActive = t.id === activeThreadId;
    const initial = (t.avatarText || t.peerAlias || 'M').charAt(0).toUpperCase();
    const unreadHtml = t.unreadCount > 0 ? `<span class="thread-unread-pill">${t.unreadCount}</span>` : '';
    const dealBadge = t.dealId ? `<span style="color: #34d399; font-size: 0.65rem; font-family: var(--font-mono); margin-left: 4px;">[${t.dealId}]</span>` : '';

    let statusPillHtml = '';
    if (t.status === 'pending_create') {
      statusPillHtml = '<span class="thread-status-tag pending-create">Chờ GĐ duyệt tạo</span>';
    } else if (t.status === 'pending_delete') {
      statusPillHtml = '<span class="thread-status-tag pending-delete">Chờ GĐ duyệt xóa</span>';
    }

    const subBadgeText = t.dealId
      ? `${formatColleagueAlias(t.buyerBlindId)} ↔ ${formatColleagueAlias(t.sellerBlindId)}`
      : (t.productName || 'Kênh chung');

    const dotClass = t.status === 'pending_create'
      ? 'thread-online-dot dot-pending'
      : (t.status === 'pending_delete' ? 'thread-online-dot dot-danger' : 'thread-online-dot');

    return `
      <div class="messenger-thread-item ${isActive ? 'active' : ''}" role="button" tabindex="0" aria-current="${isActive ? 'true' : 'false'}" data-thread-id="${escapeHtml(t.id)}">
        <div class="thread-avatar-wrap">
          <span>${escapeHtml(initial)}</span>
          <span class="${dotClass}"></span>
        </div>
        <div class="thread-content">
          <div class="thread-top-row">
            <span class="thread-peer-name">${escapeHtml(t.isCompanyRoom ? (t.peerAlias || 'Phòng chat') : (formatColleagueAlias(t.peerAlias) || 'Đồng nghiệp'))}${dealBadge}</span>
            <span class="thread-time">${escapeHtml(t.lastTime || '')}</span>
          </div>
          <div class="thread-badges-row">
            <span class="thread-product-badge">${escapeHtml(subBadgeText)}</span>
            ${statusPillHtml}
          </div>
          <div class="thread-snippet">${escapeHtml(t.lastMessage || 'Chưa có tin nhắn')}</div>
        </div>
        ${unreadHtml}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.messenger-thread-item').forEach(item => {
    const activateThread = () => {
      const threadId = item.getAttribute('data-thread-id');
      if (threadId) selectMessengerThread(threadId);
    };
    item.addEventListener('click', activateThread);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateThread();
      }
    });
  });
}

function selectMessengerThread(threadId) {
  const target = chatThreads.find(t => t.id === threadId);
  if (!target) return;

  activeThreadId = target.id;
  target.unreadCount = 0;
  saveChatThreadsToStorage();

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();

  const input = document.getElementById('chat-input-field');
  input?.focus();
}

function updateActiveThreadHeader() {
  const thread = getActiveThread();
  const roomStatusBanner = document.getElementById('room-status-banner');
  const roomStatusBadge = document.getElementById('room-status-badge');
  const roomStatusText = document.getElementById('room-status-text');
  const roomDirActions = document.getElementById('room-director-actions');
  const reqDeleteBtn = document.getElementById('room-request-delete-btn');
  const reqDeleteLabel = document.getElementById('room-request-delete-label');
  const purgeBtn = document.getElementById('purge-chat-btn');
  const p2pSetupRow = document.getElementById('p2p-setup-row');
  const chatInput = document.getElementById('chat-input-field');
  const sendBtn = document.getElementById('send-chat-btn');
  const lockedNotice = document.getElementById('chat-locked-notice');

  if (!thread) {
    if (roomStatusBanner) roomStatusBanner.style.display = 'none';
    if (reqDeleteBtn) reqDeleteBtn.style.display = 'none';
    return;
  }

  const avatarText = document.getElementById('chat-peer-avatar-text');
  const peerName = document.getElementById('chat-peer-name');
  const peerBadge = document.getElementById('chat-peer-badge');
  const prodTag = document.getElementById('active-product-tag');
  const statusText = document.getElementById('p2p-status-text');
  const pulseDot = document.getElementById('p2p-pulse-dot');

  if (avatarText) avatarText.textContent = (thread.avatarText || thread.peerAlias || 'M').charAt(0).toUpperCase();
  if (peerName) peerName.textContent = thread.isCompanyRoom ? (thread.peerAlias || 'Phòng chat nội bộ') : (formatColleagueAlias(thread.peerAlias) || 'Trợ Lý Điều Phối');

  if (thread.isCompanyRoom && isCompanyAuthActive()) {
    const user = currentCompanyState.user;
    if (p2pSetupRow) p2pSetupRow.style.display = 'none';
    if (purgeBtn) purgeBtn.style.display = 'none';

    const scopeLabel = SCOPE_LABELS_VI[thread.scope] || thread.scope;
    const deptLabel = thread.department === 'executive' ? 'Ban Điều Hành' : (thread.departmentName || thread.department);
    if (prodTag) prodTag.textContent = `${scopeLabel} · ${deptLabel}`;

    const isPendingCreate = thread.status === 'pending_create';
    const isPendingDelete = thread.status === 'pending_delete';

    if (peerBadge) {
      if (isPendingCreate) {
        peerBadge.textContent = 'Chờ GĐ duyệt tạo';
        peerBadge.className = 'verified-vendor-badge badge-pending';
      } else if (isPendingDelete) {
        peerBadge.textContent = 'Chờ GĐ duyệt xóa';
        peerBadge.className = 'verified-vendor-badge badge-danger';
      } else {
        peerBadge.textContent = 'Đang hoạt động';
        peerBadge.className = 'verified-vendor-badge';
      }
    }

    if (statusText) statusText.textContent = `Hệ thống khép kín · ${(thread.messages || []).length} tin nhắn`;
    if (pulseDot) pulseDot.className = isPendingCreate ? 'p2p-pulse-dot' : 'p2p-pulse-dot connected';

    // Banner & Composer lock
    if (isPendingCreate || isPendingDelete) {
      if (roomStatusBanner) {
        roomStatusBanner.style.display = 'flex';
        roomStatusBanner.className = `room-status-banner ${isPendingDelete ? 'is-danger' : 'is-pending'}`;
      }
      if (roomStatusBadge) {
        roomStatusBadge.textContent = isPendingCreate ? 'Chờ duyệt mở phòng' : 'Chờ duyệt xóa phòng';
      }
      if (roomStatusText) {
        roomStatusText.textContent = isPendingCreate
          ? `Yêu cầu tạo phòng từ Quản lí ${thread.requestedByName || ''} đang chờ Giám đốc phê duyệt.`
          : `Quản lí ${thread.requestedByName || ''} đã đề xuất xóa phòng/đoạn chat này — Chờ Giám đốc phê duyệt.`;
      }
      if (roomDirActions) {
        roomDirActions.style.display = user.role === 'director' ? 'flex' : 'none';
      }
    } else {
      if (roomStatusBanner) roomStatusBanner.style.display = 'none';
      if (roomDirActions) roomDirActions.style.display = 'none';
    }

    // Lock composer when pending_create
    if (chatInput) chatInput.disabled = isPendingCreate;
    if (sendBtn) sendBtn.disabled = isPendingCreate;
    if (lockedNotice) lockedNotice.style.display = isPendingCreate ? 'block' : 'none';

    // Request Delete button rules
    if (reqDeleteBtn && reqDeleteLabel) {
      if (user.role === 'director') {
        reqDeleteBtn.style.display = 'inline-flex';
        reqDeleteBtn.disabled = false;
        reqDeleteLabel.textContent = 'Xóa phòng ngay';
      } else if (
        user.role === 'manager' &&
        (thread.scope === 'department' || thread.scope === 'work') &&
        thread.department === user.department
      ) {
        reqDeleteBtn.style.display = 'inline-flex';
        if (isPendingDelete) {
          reqDeleteBtn.disabled = true;
          reqDeleteLabel.textContent = 'Đã gửi yêu cầu xóa (Chờ GĐ)';
        } else {
          reqDeleteBtn.disabled = false;
          reqDeleteLabel.textContent = 'Yêu cầu xóa phòng';
        }
      } else {
        reqDeleteBtn.style.display = 'none';
      }
    }

    const banner = document.getElementById('auto-deal-banner');
    if (banner) banner.style.display = 'none';
    return;
  }

  if (roomStatusBanner) roomStatusBanner.style.display = 'none';
  if (reqDeleteBtn) reqDeleteBtn.style.display = 'none';
  if (lockedNotice) lockedNotice.style.display = 'none';
  if (chatInput) chatInput.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  if (thread.dealId) {
    const myId = formatColleagueAlias(thread.myBlindId || (getMyDealRole(thread) === 'buyer' ? thread.buyerBlindId : thread.sellerBlindId) || 'Thành viên');
    const pairLabel = `${formatColleagueAlias(thread.buyerBlindId)} ↔ ${formatColleagueAlias(thread.sellerBlindId)}`;
    if (prodTag) prodTag.textContent = pairLabel;
    if (peerBadge) {
      peerBadge.textContent = `Bạn: ${myId}`;
      peerBadge.className = 'verified-vendor-badge p2p-connected-badge';
    }
    if (statusText) statusText.textContent = `${pairLabel} · [${thread.dealId}]`;
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot connected';
  } else {
    if (prodTag) prodTag.textContent = thread.productName || 'Trao đổi chung';
    if (peerBadge) {
      peerBadge.textContent = 'Đã xác thực nội bộ';
      peerBadge.className = 'verified-vendor-badge';
    }
    if (statusText) statusText.textContent = 'Trợ lý nội bộ (Chưa nối máy P2P)';
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot disconnected';
  }

  // Update Auto-Deal Banner if applicable
  const banner = document.getElementById('auto-deal-banner');
  const codeBadge = document.getElementById('auto-deal-code-badge');
  const prodLabel = document.getElementById('auto-deal-product-label');

  if (thread.dealId) {
    if (banner) banner.style.display = 'flex';
    if (codeBadge) codeBadge.textContent = thread.dealId;
    if (prodLabel) prodLabel.textContent = thread.productName || 'Công việc nội bộ';
    const blindBadge = document.getElementById('auto-deal-blind-badge');
    if (blindBadge) blindBadge.textContent = `🛡️ ${formatColleagueAlias(thread.buyerBlindId)} ↔ ${formatColleagueAlias(thread.sellerBlindId)}`;
  } else {
    if (banner) banner.style.display = 'none';
  }
}

function getMyDealRole(deal) {
  if (!deal || !deal.dealId) return 'buyer';
  try {
    const savedRole = sessionStorage.getItem(`ghost_my_deal_role_${deal.dealId}`);
    if (savedRole === 'buyer' || savedRole === 'seller') return savedRole;
  } catch {}
  return 'seller';
}

function setMyDealRole(dealId, role) {
  if (!dealId) return;
  try {
    sessionStorage.setItem(`ghost_my_deal_role_${dealId}`, role);
  } catch {}
}

async function startAutoBlindDeal(productName, productId = '') {
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  const dealId = `DEAL-${randHex}`;
  const threadId = `thread-${productId || 'item'}-${randHex}`;

  let createdDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        dealId,
        productId,
        productName,
        initiatorAlias: anonymousAlias
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) createdDeal = data.deal;
    }
  } catch {}

  if (!createdDeal) {
    const bMask = randHex.slice(0, 4);
    const sMask = Array.from(crypto.getRandomValues(new Uint8Array(2)))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    createdDeal = {
      dealId,
      productId: productId || 'custom',
      productName: productName || 'Mặt hàng ẩn danh',
      buyerBlindId: `ID-Mua #${bMask}`,
      sellerBlindId: `ID-Bán #${sMask}`,
      status: 'connected',
      createdAt: Date.now(),
      messages: [
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          senderBlindId: 'HỆ THỐNG',
          time: getCurrentTimeStr(),
          text: `🔐 [${dealId}] Đã kết nối ẩn danh: ${`ID-Mua #${bMask}`} ↔ ${`ID-Bán #${sMask}`}`
        }
      ]
    };
  }

  setMyDealRole(createdDeal.dealId, 'buyer');

  // Spawn new conversation thread in Messenger
  const newThread = {
    id: threadId,
    dealId: createdDeal.dealId,
    productId: productId || 'general',
    productName: productName,
    buyerBlindId: createdDeal.buyerBlindId,
    sellerBlindId: createdDeal.sellerBlindId,
    myBlindId: createdDeal.buyerBlindId,
    peerAlias: createdDeal.sellerBlindId || 'ID-Bán',
    peerRole: 'merchant',
    avatarText: 'N',
    lastMessage: `${createdDeal.buyerBlindId} ↔ ${createdDeal.sellerBlindId}`,
    lastTime: getCurrentTimeStr(),
    unreadCount: 0,
    messages: createdDeal.messages.map(m => ({
      author: m.senderBlindId || 'HỆ THỐNG',
      role: 'system',
      time: m.time || getCurrentTimeStr(),
      text: m.text
    }))
  };

  chatThreads.unshift(newThread);
  activeThreadId = newThread.id;
  activeAutoDeal = createdDeal;

  saveChatThreadsToStorage();
  saveActiveDealToStorage(createdDeal);

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: createdDeal,
        thread: newThread
      });
    } catch {}
  }

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();

  showToast(`💬 Đã mở kênh thảo luận [${createdDeal.dealId}] cho "${productName}"`, 'success');
  return createdDeal;
}

function applyIncomingBlindDealState(deal, isInitiator = false) {
  if (!deal || !deal.dealId) return;

  // If already burned, ignore immediately to stop notification storms
  if (alreadyBurnedDeals.has(deal.dealId) || lastBurnedDealId === deal.dealId) {
    return;
  }
  if (deal.status === 'completed_burned') {
    executeLocalDealAutoBurn(deal.dealId, true);
    return;
  }

  let matchingThread = chatThreads.find(t => t.dealId === deal.dealId);

  if (!matchingThread) {
    let existingRole = null;
    try {
      existingRole = sessionStorage.getItem(`ghost_my_deal_role_${deal.dealId}`);
    } catch {}
    if (!existingRole && !isInitiator) {
      setMyDealRole(deal.dealId, 'seller');
    }

    const myRole = getMyDealRole(deal);
    const partnerName = myRole === 'buyer' ? deal.sellerBlindId : deal.buyerBlindId;
    const myBlindId = myRole === 'buyer' ? deal.buyerBlindId : deal.sellerBlindId;
    const initialAvatar = myRole === 'buyer' ? 'B' : 'M';

    matchingThread = {
      id: `thread-${deal.dealId}`,
      dealId: deal.dealId,
      productId: deal.productId || 'general',
      productName: deal.productName || 'Giao dịch Ẩn danh',
      buyerBlindId: deal.buyerBlindId,
      sellerBlindId: deal.sellerBlindId,
      myBlindId: myBlindId,
      peerAlias: partnerName,
      peerRole: myRole === 'buyer' ? 'merchant' : 'buyer',
      avatarText: initialAvatar,
      lastMessage: deal.messages?.[deal.messages.length - 1]?.text || `${deal.buyerBlindId} ↔ ${deal.sellerBlindId}`,
      lastTime: getCurrentTimeStr(),
      unreadCount: isInitiator ? 0 : 1,
      messages: []
    };

    chatThreads.unshift(matchingThread);
    if (!isInitiator) {
      if (activeThreadId === 'thread-merchant-general' || !activeThreadId) {
        activeThreadId = matchingThread.id;
      }
    }

    // Only notify ONCE per unique dealId
    if (!seenDealNotifications.has(deal.dealId)) {
      seenDealNotifications.add(deal.dealId);
      if (!isInitiator) {
        playNotificationChime();
        showToast(`💬 Kênh trao đổi mới [${deal.dealId}]: ${deal.productName || 'Công việc'}`, 'info');
      }
    }
  } else {
    const myRole = getMyDealRole(deal);
    matchingThread.buyerBlindId = deal.buyerBlindId;
    matchingThread.sellerBlindId = deal.sellerBlindId;
    matchingThread.myBlindId = myRole === 'buyer' ? deal.buyerBlindId : deal.sellerBlindId;
    matchingThread.peerAlias = myRole === 'buyer' ? deal.sellerBlindId : deal.buyerBlindId;
  }

  const myRole = getMyDealRole(deal);
  const prevMsgCount = Array.isArray(matchingThread.messages) ? matchingThread.messages.length : 0;
  const incomingMsgs = Array.isArray(deal.messages) ? deal.messages : [];

  if (incomingMsgs.length > 0) {
    matchingThread.messages = incomingMsgs.map(m => {
      if (m.role === 'system') {
        return {
          author: m.senderBlindId || 'HỆ THỐNG',
          role: 'system',
          time: m.time || getCurrentTimeStr(),
          text: m.text
        };
      }
      if (m.role === myRole) {
        return {
          author: m.senderBlindId || matchingThread.myBlindId || (myRole === 'buyer' ? 'ID-Mua' : 'ID-Bán'),
          role: 'buyer',
          time: m.time || getCurrentTimeStr(),
          text: m.text
        };
      }
      return {
        author: m.senderBlindId || matchingThread.peerAlias || (myRole === 'buyer' ? 'ID-Bán' : 'ID-Mua'),
        role: 'merchant',
        time: m.time || getCurrentTimeStr(),
        text: m.text
      };
    });

    const last = incomingMsgs[incomingMsgs.length - 1];
    if (last) {
      matchingThread.lastMessage = last.text;
      matchingThread.lastTime = last.time || getCurrentTimeStr();
    }

    // ONLY notify if genuinely new messages arrived from the other party (strictly avoids polling loop storms!)
    if (incomingMsgs.length > prevMsgCount) {
      const newMessages = incomingMsgs.slice(prevMsgCount);
      const otherMessages = newMessages.filter(m => m.role !== myRole && m.role !== 'system');

      if (otherMessages.length > 0 && !isInitiator) {
        if (matchingThread.id !== activeThreadId) {
          matchingThread.unreadCount = (matchingThread.unreadCount || 0) + otherMessages.length;
        }
        playNotificationChime();
        showToast(`💬 Tin nhắn mới từ ${formatColleagueAlias(matchingThread.peerAlias)}`, 'info');
      }
    }
  }

  saveChatThreadsToStorage();
  renderMessengerThreads();
  if (matchingThread.id === activeThreadId) {
    updateActiveThreadHeader();
    renderChatMessages();
  }
  updateFloatingMessengerBadge();
  updateRamMonitor();
}

async function sendBlindDealMessage(text) {
  const thread = getActiveThread();
  if (!thread || !thread.dealId) return;

  const myRole = getMyDealRole({ dealId: thread.dealId });
  const senderBlindId = thread.myBlindId || (myRole === 'seller' ? (thread.sellerBlindId || 'ID-Bán') : (thread.buyerBlindId || 'ID-Mua'));

  let updatedDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        dealId: thread.dealId,
        senderRole: myRole,
        text
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) updatedDeal = data.deal;
    }
  } catch {}

  if (!updatedDeal) {
    thread.messages.push({
      author: senderBlindId,
      role: 'buyer',
      time: getCurrentTimeStr(),
      text
    });
    thread.lastMessage = text;
    thread.lastTime = getCurrentTimeStr();
  } else {
    applyIncomingBlindDealState(updatedDeal, true);
  }

  saveChatThreadsToStorage();
  renderMessengerThreads();
  renderChatMessages();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: updatedDeal,
        threadId: thread.id
      });
    } catch {}
  }
}

function removeSoldProductFromMarket(productId, productName = '') {
  let matched = null;
  if (productId && productId !== 'general' && productId !== 'custom') {
    matched = MARKET_PRODUCTS.find(p => p.id === productId) || myVendorListings.find(p => p.id === productId);
  }
  if (!matched && productName) {
    matched = MARKET_PRODUCTS.find(p => p.name === productName) || myVendorListings.find(p => p.name === productName);
  }

  const targetId = matched?.id || (productId !== 'general' && productId !== 'custom' ? productId : '');
  if (!targetId) return null;

  addRevokedProductId(targetId);
  MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== targetId);
  myVendorListings = myVendorListings.filter(p => p.id !== targetId);
  saveMyVendorListingsToStorage();
  saveMarketProductsToStorage();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'REVOKE_PRODUCT',
        productId: targetId
      });
    } catch {}
  }

  if (isP2PConnected && activePeerConnection) {
    try {
      activePeerConnection.send({
        type: 'market_item_revoked',
        productId: targetId
      });
    } catch {}
  }

  updateCategoryPillCounts();
  populateOrderProductSelect(MARKET_PRODUCTS);
  filterAndRenderProducts();
  renderMyListings();
  updateRamMonitor();
  return targetId;
}

async function confirmBlindDealPayment() {
  const thread = getActiveThread();
  if (!thread || !thread.dealId) {
    showToast('Chưa có phiên giao dịch nào đang mở!', 'warning');
    return;
  }

  const prodId = thread.productId || activeAutoDeal?.productId || activeOrder?.product?.id || '';
  const prodName = thread.productName || activeAutoDeal?.productName || activeOrder?.product?.name || '';

  let updatedDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pay_escrow',
        dealId: thread.dealId,
        productId: prodId,
        productName: prodName
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) updatedDeal = data.deal;
    }
  } catch {}

  // Immediately remove the sold product from the marketplace once it has a buyer!
  removeSoldProductFromMarket(prodId, prodName);

  thread.messages.push({
    author: 'KÝ QUỸ RAM (ESCROW)',
    role: 'system',
    time: getCurrentTimeStr(),
    text: `📋 [ĐÃ TIẾP NHẬN BÀN GIAO]: Đồng nghiệp đã xác nhận tiếp nhận cho phiên [${thread.dealId}]. Hạng mục "${prodName}" đã được rút khỏi bảng tin chung! Khi bàn giao xong, nhấn "✅ Hoàn Tất Bàn Giao (Tự Hủy Chat)" để xóa sạch lịch sử khỏi RAM.`
  });
  thread.lastMessage = 'Đã tiếp nhận bàn giao';
  thread.lastTime = getCurrentTimeStr();

  saveChatThreadsToStorage();
  renderMessengerThreads();
  renderChatMessages();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: updatedDeal || { dealId: thread.dealId, productId: prodId, productName: prodName, status: 'paid_escrow' }
      });
    } catch {}
  }

  showToast(`📋 Đã xác nhận tiếp nhận "${prodName}"! Mục này đã được lưu kho nội bộ.`, 'success');
}

async function completeDealAndAutoBurn() {
  const thread = getActiveThread();
  const targetDealId = thread?.dealId || activeAutoDeal?.dealId || 'DEAL-RAM';
  const prodId = thread?.productId || activeAutoDeal?.productId || activeOrder?.product?.id || '';
  const prodName = thread?.productName || activeAutoDeal?.productName || activeOrder?.product?.name || '';

  try {
    await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete_and_burn',
        dealId: targetDealId,
        productId: prodId,
        productName: prodName
      })
    });
  } catch {}

  removeSoldProductFromMarket(prodId, prodName);

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_COMPLETED_BURN',
        dealId: targetDealId,
        productId: prodId,
        productName: prodName
      });
    } catch {}
  }

  executeLocalDealAutoBurn(targetDealId, false, prodId, prodName);
}

function executeLocalDealAutoBurn(dealId, isRemoteTrigger = false, soldProductId = '', soldProductName = '') {
  const burnedCode = dealId || 'DEAL';
  lastBurnedDealId = burnedCode;

  const targetThread = chatThreads.find(t => t.dealId === burnedCode);
  const pId = soldProductId || targetThread?.productId || activeAutoDeal?.productId || activeOrder?.product?.id || '';
  const pName = soldProductName || targetThread?.productName || activeAutoDeal?.productName || activeOrder?.product?.name || '';

  if (pId || pName) {
    removeSoldProductFromMarket(pId, pName);
  }

  activeAutoDeal = null;
  activeOrder = null;
  if (orderCountdownTimer) {
    clearInterval(orderCountdownTimer);
    orderCountdownTimer = null;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
  } catch {}

  const orderResultBox = document.getElementById('order-result-box');
  if (orderResultBox) orderResultBox.style.display = 'none';

  // Remove the burned thread from Messenger threads
  chatThreads = chatThreads.filter(t => t.dealId !== burnedCode);
  if (chatThreads.length === 0) {
    inMemoryChatMessages = [];
  } else {
    activeThreadId = chatThreads[0].id;
  }

  saveChatThreadsToStorage();

  const banner = document.getElementById('auto-deal-banner');
  if (banner) banner.style.display = 'none';

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();
  updateRamMonitor();

  playNotificationChime();
  showToast(
    `✅ Đã hoàn tất bàn giao! Hạng mục và lịch sử hội thoại [${burnedCode}] đã tự động xóa sạch khỏi RAM cả 2 bên.`,
    'success'
  );
}

async function pollBlindDealRelay() {
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return;
    const data = await res.json();

    if (data && Array.isArray(data.soldOrRevokedIds)) {
      data.soldOrRevokedIds.forEach(soldId => {
        if (soldId && !revokedProductIds.has(soldId)) {
          removeSoldProductFromMarket(soldId);
        }
      });
    }

    if (data && data.lastBurnedDealId && data.lastBurnedDealId !== lastBurnedDealId) {
      const hasThread = chatThreads.some(t => t.dealId === data.lastBurnedDealId);
      if (hasThread || (activeAutoDeal && activeAutoDeal.dealId === data.lastBurnedDealId)) {
        executeLocalDealAutoBurn(data.lastBurnedDealId, true, data.lastSoldProductId || '');
      }
    }

    if (data && Array.isArray(data.deals)) {
      data.deals.forEach(deal => {
        applyIncomingBlindDealState(deal, false);
      });
    } else if (data && data.deal) {
      applyIncomingBlindDealState(data.deal, false);
    }
  } catch {}
}

function initEncryptedChat() {
  loadChatThreadsFromStorage();

  const sendBtn = document.getElementById('send-chat-btn');
  const chatInput = document.getElementById('chat-input-field');
  const purgeBtn = document.getElementById('purge-chat-btn');
  const quickBtns = document.querySelectorAll('.quick-q-btn');
  const copyPgpBtn = document.getElementById('copy-pgp-fingerprint');
  const confirmPayBtn = document.getElementById('btn-deal-confirm-pay');
  const completeBurnBtn = document.getElementById('btn-deal-complete-burn');
  const newThreadBtn = document.getElementById('btn-new-thread');
  const searchThreadInput = document.getElementById('messenger-thread-search');
  const floatingMessengerBtn = document.getElementById('floating-messenger-btn');

  // Search filter in threads list
  if (searchThreadInput) {
    searchThreadInput.addEventListener('input', () => {
      renderMessengerThreads();
    });
  }

  // New Room / Thread CTA
  if (newThreadBtn) {
    newThreadBtn.addEventListener('click', () => {
      if (isCompanyAuthActive()) {
        openCreateRoomModal();
        return;
      }
      const topic = prompt('Nhập tên đầu việc hoặc chủ đề cần thảo luận:', 'Họp nhóm dự án');
      if (topic && topic.trim()) {
        startAutoBlindDeal(topic.trim(), 'custom');
      }
    });
  }

  // Floating Messenger Dock Button
  if (floatingMessengerBtn) {
    floatingMessengerBtn.addEventListener('click', () => {
      switchTab('tab-chat');
      const input = document.getElementById('chat-input-field');
      input?.focus();
    });
  }

  // Deal confirmation buttons
  if (confirmPayBtn) {
    confirmPayBtn.addEventListener('click', () => {
      confirmBlindDealPayment();
    });
  }

  if (completeBurnBtn) {
    completeBurnBtn.addEventListener('click', () => {
      completeDealAndAutoBurn();
    });
  }

  // P2P Controls
  const btnHost = document.getElementById('btn-p2p-host');
  const btnJoin = document.getElementById('btn-p2p-join');
  const inputCode = document.getElementById('input-p2p-code');
  const btnCopy = document.getElementById('btn-p2p-copy-link');
  const btnDisconnect = document.getElementById('btn-p2p-disconnect');

  if (btnHost) {
    btnHost.addEventListener('click', () => {
      const roomCode = generateRoomCode();
      startHostingP2PRoom(roomCode);
    });
  }

  if (btnJoin && inputCode) {
    btnJoin.addEventListener('click', () => {
      let code = inputCode.value.trim();
      if (!code) {
        showToast('Vui lòng nhập mã phòng P2P!', 'warning');
        return;
      }
      if (code.includes('#room=')) {
        code = decodeURIComponent(code.split('#room=')[1]);
      }
      joinP2PRoom(code);
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      if (currentRoomCode) {
        const link = getRoomShareableLink(currentRoomCode);
        navigator.clipboard.writeText(link).then(() => {
          showToast('Đã sao chép link phòng họp P2P! Gửi cho đồng nghiệp để tham gia.', 'success');
        });
      }
    });
  }

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      disconnectP2P(false);
      showToast('Đã ngắt kết nối P2P!', 'info');
    });
  }

  // Purge current thread button
  if (purgeBtn) {
    purgeBtn.addEventListener('click', () => {
      const thread = getActiveThread();
      if (thread) {
        thread.messages = [];
        thread.lastMessage = 'Đoạn chat đã được xóa sạch khỏi RAM';
        saveChatThreadsToStorage();
        renderChatMessages();
        renderMessengerThreads();
        updateRamMonitor();
        showToast(`Đã xóa sạch tin nhắn của đoạn chat "${thread.productName}" trong RAM!`, 'success');
      }
    });
  }

  // Room filter pills
  const roomFilterWrap = document.getElementById('room-filter-pills');
  if (roomFilterWrap) {
    roomFilterWrap.addEventListener('click', (e) => {
      const chip = e.target.closest('.room-filter-chip');
      if (!chip) return;
      activeRoomFilter = chip.getAttribute('data-room-filter') || 'all';
      roomFilterWrap.querySelectorAll('.room-filter-chip').forEach(btn => {
        const active = btn === chip;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      renderMessengerThreads();
    });
  }

  // Attachment button & staging
  const attachBtn = document.getElementById('attach-file-btn');
  const fileInput = document.getElementById('chat-file-input');
  const removeAttBtn = document.getElementById('remove-attachment-btn');
  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => {
      if (chatInput?.disabled) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast('Tệp vượt quá giới hạn tối đa 2MB.', 'warning');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        pendingAttachmentPayload = {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataBase64: reader.result
        };
        const chip = document.getElementById('pending-attachment-chip');
        const chipName = document.getElementById('pending-attachment-name');
        if (chipName) chipName.textContent = `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`;
        if (chip) chip.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });
  }
  if (removeAttBtn) {
    removeAttBtn.addEventListener('click', clearPendingAttachment);
  }

  // @Mention autocomplete
  if (chatInput) {
    chatInput.addEventListener('input', handleMentionAutocompleteInput);
    chatInput.addEventListener('keydown', (e) => {
      const popup = document.getElementById('mention-autocomplete-list');
      if (!popup || popup.style.display === 'none' || mentionSuggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionActiveIndex = (mentionActiveIndex + 1) % mentionSuggestions.length;
        renderMentionPopup();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionActiveIndex = (mentionActiveIndex - 1 + mentionSuggestions.length) % mentionSuggestions.length;
        renderMentionPopup();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopImmediatePropagation();
        applyMentionSuggestion(mentionSuggestions[mentionActiveIndex]);
      } else if (e.key === 'Escape') {
        hideMentionPopup();
      }
    });
  }

  // Send message
  const handleSend = async () => {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    const thread = getActiveThread();
    if (!thread) return;

    if (thread.isCompanyRoom && isCompanyAuthActive()) {
      if (!text && !pendingAttachmentPayload) return;
      const att = pendingAttachmentPayload;
      chatInput.value = '';
      clearPendingAttachment();
      hideMentionPopup();
      await sendCompanyRoomMessage(thread.id, text, att);
      return;
    }

    if (!text) return;

    chatInput.value = '';

    if (thread.dealId) {
      sendBlindDealMessage(text);
      return;
    }

    if (isP2PConnected && activePeerConnection) {
      try {
        activePeerConnection.send({
          type: 'chat',
          text,
          alias: anonymousAlias,
          time: getCurrentTimeStr()
        });
      } catch {}

      thread.messages.push({
        author: `Tôi (${anonymousAlias})`,
        role: 'buyer',
        time: getCurrentTimeStr(),
        text
      });
      thread.lastMessage = text;
      thread.lastTime = getCurrentTimeStr();
    } else {
      // Offline / Bot mode simulation
      thread.messages.push({
        author: anonymousAlias || 'Ghost-Buyer',
        role: 'buyer',
        time: getCurrentTimeStr(),
        text
      });
      thread.lastMessage = text;
      thread.lastTime = getCurrentTimeStr();

      const typing = document.getElementById('chat-typing-indicator');
      if (typing) typing.style.display = 'flex';

      setTimeout(() => {
        if (typing) typing.style.display = 'none';
        const reply = generateMerchantReply(text);
        thread.messages.push({
          author: thread.peerAlias || 'Trợ Lý Điều Phối',
          role: 'merchant',
          time: getCurrentTimeStr(),
          text: reply
        });
        thread.lastMessage = reply;
        thread.lastTime = getCurrentTimeStr();
        saveChatThreadsToStorage();
        renderChatMessages();
        renderMessengerThreads();
        updateRamMonitor();
      }, 700);
    }

    saveChatThreadsToStorage();
    renderChatMessages();
    renderMessengerThreads();
    updateRamMonitor();
  };

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Quick inquiry chips
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q');
      if (q && chatInput) {
        chatInput.value = q;
        chatInput.focus();
      }
    });
  });

  // Copy PGP fingerprint
  if (copyPgpBtn) {
    copyPgpBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC').then(() => {
        showToast('Đã sao chép dấu vân tay chứng thư nội bộ!', 'success');
      });
    });
  }

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();

  // Background relay poll only outside closed-company RBAC mode
  setInterval(() => {
    if (!companyAuthToken) {
      pollBlindDealRelay();
    }
  }, 2000);
}

function renderChatMessages() {
  const container = document.getElementById('chat-message-list');
  if (!container) return;

  const thread = getActiveThread();
  const msgs = thread ? thread.messages : inMemoryChatMessages;

  if (!msgs || msgs.length === 0) {
    container.innerHTML = `<div style="margin: auto; text-align: center; color: #94a3b8; font-size: 0.84rem; padding: 2rem;">
      <span style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem;">🔒</span>
      Chưa có tin nhắn trong cuộc trò chuyện này.<br>Gõ tin nhắn bên dưới để bắt đầu đàm thoại bảo mật!
    </div>`;
    return;
  }

  const curUser = isCompanyAuthActive() ? currentCompanyState.user : null;
  container.innerHTML = msgs.map(msg => {
    if (msg.role === 'system') {
      return `
        <div class="chat-system-msg">
          <div class="system-bubble">${escapeHtml(msg.text)}</div>
          <span class="system-time">${escapeHtml(msg.time)}</span>
        </div>
      `;
    }

    const isSelf = msg.role === 'buyer';
    const displayAuthor = isSelf
      ? (thread?.isCompanyRoom ? (msg.author || 'Bạn') : formatColleagueAlias(msg.author || thread?.myBlindId || 'Thành viên'))
      : (thread?.isCompanyRoom ? (msg.author || 'Đồng nghiệp') : formatColleagueAlias(msg.author || thread?.peerAlias || 'Phụ trách'));

    const formattedText = formatMessageWithMentions(msg.text || '');

    let attachmentHtml = '';
    if (thread?.isCompanyRoom && msg.attachment && msg.attachment.id && companyAuthToken) {
      const isImg = (msg.attachment.mimeType || '').startsWith('image/');
      const sizeKb = Math.max(1, Math.round((msg.attachment.size || 0) / 1024));
      attachmentHtml = `
        <div class="msg-attachment-box ${isImg ? 'is-image' : ''}" data-att-room="${escapeHtml(thread.id)}" data-att-id="${escapeHtml(msg.attachment.id)}" data-att-name="${escapeHtml(msg.attachment.name)}" data-att-mime="${escapeHtml(msg.attachment.mimeType || 'application/octet-stream')}">
          ${isImg ? `<img alt="${escapeHtml(msg.attachment.name)}" class="msg-att-preview-img msg-att-lazy-img" style="display:none;">` : ''}
          <button type="button" class="msg-att-dl-btn">
            <span>${isImg ? '🖼️' : '📎'} ${escapeHtml(msg.attachment.name)} (${sizeKb} KB) — Tải về an toàn</span>
          </button>
        </div>`;
    }

    const pendingBannerHtml = msg.deleteStatus === 'pending_delete'
      ? `<div class="msg-pending-delete-pill">Chờ Giám đốc duyệt xóa · Đề xuất: ${escapeHtml(msg.deleteRequestedByName || 'Quản lí')}</div>`
      : '';

    let msgActionBtns = '';
    if (thread?.isCompanyRoom && curUser && msg.id) {
      if (curUser.role === 'director') {
        if (msg.deleteStatus === 'pending_delete') {
          msgActionBtns = `
            <div class="msg-inline-actions">
              <button type="button" class="msg-mini-btn approve msg-decide-del-btn" data-msg-id="${escapeHtml(msg.id)}" data-decision="approve">Duyệt xóa</button>
              <button type="button" class="msg-mini-btn msg-decide-del-btn" data-msg-id="${escapeHtml(msg.id)}" data-decision="reject">Giữ lại</button>
            </div>`;
        } else {
          msgActionBtns = `
            <div class="msg-inline-actions">
              <button type="button" class="msg-mini-btn danger msg-req-del-btn" data-msg-id="${escapeHtml(msg.id)}">Xóa tin</button>
            </div>`;
        }
      } else if (
        curUser.role === 'manager' &&
        (thread.scope === 'department' || thread.scope === 'work') &&
        thread.department === curUser.department
      ) {
        if (msg.deleteStatus !== 'pending_delete') {
          msgActionBtns = `
            <div class="msg-inline-actions">
              <button type="button" class="msg-mini-btn danger msg-req-del-btn" data-msg-id="${escapeHtml(msg.id)}">Yêu cầu xóa</button>
            </div>`;
        }
      }
    }

    return `
      <div class="chat-msg ${isSelf ? 'buyer' : 'merchant'} ${msg.deleteStatus === 'pending_delete' ? 'is-pending-delete' : ''}">
        <div class="msg-bubble">
          <div class="msg-author-tag" ${isSelf ? 'style="color: #a7f3d0;"' : ''}>${escapeHtml(displayAuthor)}</div>
          ${pendingBannerHtml}
          <div class="msg-text">${formattedText}</div>
          ${attachmentHtml}
          <div class="msg-footer-meta">
            <span class="msg-meta-time">${escapeHtml(msg.time)}</span>
            ${msgActionBtns}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.msg-req-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mId = btn.getAttribute('data-msg-id');
      if (mId && thread) requestDeleteCompanyMessage(thread.id, mId);
    });
  });
  container.querySelectorAll('.msg-decide-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mId = btn.getAttribute('data-msg-id');
      const decision = btn.getAttribute('data-decision');
      if (mId && thread && decision) decideMessageApproval(thread.id, mId, decision);
    });
  });

  hydrateSecureAttachments(container);
  container.scrollTop = container.scrollHeight;
}

function generateMerchantReply(userMsg) {
  const lower = userMsg.toLowerCase();

  if (lower.includes('tiến độ') || lower.includes('phụ trách')) {
    return 'Hạng mục này hiện đang được xử lý bởi nhóm phụ trách liên quan. Bạn có thể sang tab "Bàn Giao & Cấp Phát Mật" để tạo phiếu tiếp nhận và lấy mã Token đối chiếu.';
  }

  if (lower.includes('drop') || lower.includes('bàn giao') || lower.includes('mật khẩu')) {
    return 'Mọi thông tin nhạy cảm (file .env, API Key, cấu hình VPN, tài liệu nội bộ) đều được mã hóa AES-256-GCM dưới dạng Drop Token tự hủy 1 lần. Ngay khi đồng nghiệp mở xem, dữ liệu sẽ biến mất khỏi RAM máy chủ.';
  }

  if (lower.includes('pgp') || lower.includes('quyền') || lower.includes('xác minh')) {
    return 'Dấu vân tay chứng thư nội bộ hiện hành: [4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC]. Bạn có thể gắn PGP Public Key của phòng ban khi tạo Phiếu Bàn Giao.';
  }

  if (lower.includes('zero-log') || lower.includes('log') || lower.includes('lưu')) {
    return 'Hệ thống làm việc nội bộ vận hành hoàn toàn trên RAM khả biến (Zero-Log): không lưu lịch sử xuống ổ đĩa cứng. Toàn bộ tin nhắn sẽ tự xóa sạch khi đóng phiên hoặc nhấn ESC.';
  }

  return `Đã ghi nhận tin nhắn: "${userMsg}". Bạn có thể mời đồng nghiệp vào phòng họp P2P trực tiếp máy-tới-máy ở góc phải, hoặc chuyển sang tab "Bàn Giao" để tạo phiếu tiếp nhận tài nguyên.`;
}

function getCurrentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

/* ==========================================================================
   6. ANONYMOUS ORDER & RAM ESCROW SYSTEM
   ========================================================================== */

function initOrderSystem() {
  const productSelect = document.getElementById('order-product-select');
  const createOrderBtn = document.getElementById('create-order-btn');
  const clearOrderBtn = document.getElementById('clear-order-btn');
  const cancelOrderBtn = document.getElementById('cancel-order-btn');
  const completeOrderBurnBtn = document.getElementById('complete-order-burn-btn');
  const copyXmrBtn = document.getElementById('copy-xmr-btn');
  const showQrBtn = document.getElementById('show-order-qr-btn');
  const chatAboutOrderBtn = document.getElementById('chat-about-order-btn');
  const samplePgpBtn = document.getElementById('insert-sample-pgp-btn');
  const ttlPills = document.querySelectorAll('#order-ttl-pills .ttl-pill');
  const ttlValueInput = document.getElementById('order-ttl-value');

  if (productSelect) {
    productSelect.addEventListener('change', () => {
      updateOrderPreviewCard();
    });
  }

  // TTL Pills Selection
  ttlPills.forEach(pill => {
    pill.setAttribute('aria-pressed', pill.classList.contains('active') ? 'true' : 'false');
    pill.addEventListener('click', () => {
      ttlPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-pressed', 'true');
      if (ttlValueInput) {
        ttlValueInput.value = pill.getAttribute('data-ttl');
      }
    });
  });

  // Sample .env secret template button
  if (samplePgpBtn) {
    samplePgpBtn.addEventListener('click', () => {
      const secretInput = document.getElementById('order-receiver-pubkey');
      if (secretInput) {
        secretInput.value = 'API_GATEWAY_HOST=10.24.0.15:8443\nDB_STAGING_PASS=Nx#92kLm!Prod2026\nHSM_SLOT_PIN=482910';
        showToast('Đã điền mẫu cấu hình .env để thử nghiệm mã hóa AES-256-GCM!', 'info');
      }
    });
  }

  // Real AES-256-GCM Zero-Knowledge RAM Drop Handover Creator
  if (createOrderBtn) {
    createOrderBtn.addEventListener('click', async () => {
      const secretInput = document.getElementById('order-receiver-pubkey');
      const pinInput = document.getElementById('handover-pin-input');
      const prodId = productSelect?.value;
      const product = MARKET_PRODUCTS.find(p => p.id === prodId) || MARKET_PRODUCTS[0] || {
        id: 'internal',
        name: 'Tài liệu nội bộ',
        approxUSD: 'Nội bộ công ty',
        priceXMR: 'Mật'
      };
      const ttl = parseInt(ttlValueInput?.value || '3600', 10);
      const secretText = (secretInput?.value || '').trim();
      const passphrase = (pinInput?.value || '').trim();

      if (!secretText) {
        showToast('Vui lòng nhập nội dung mật cần mã hóa bàn giao!', 'warning');
        secretInput?.focus();
        return;
      }

      createOrderBtn.disabled = true;
      try {
        const senderLabel = isCompanyAuthActive()
          ? `${currentCompanyState.user.name} (@${currentCompanyState.user.username})`
          : (anonymousAlias || 'Thành viên nội bộ');

        const envelopeObj = {
          projectId: product.id,
          projectName: product.name,
          senderName: senderLabel,
          secretText,
          createdAt: new Date().toLocaleString('vi-VN')
        };

        // Client-side AES-256-GCM encryption (Key NEVER sent to server!)
        const symKey = await generateSymmetricKey();
        const keyBase64Url = await exportKeyToBase64Url(symKey);
        const encryptedBytes = await encryptPayload(JSON.stringify(envelopeObj), symKey, {
          passphrase: passphrase || '',
          pad: true
        });
        const ciphertext = bufferToBase64Url(encryptedBytes);

        const res = await bazaarApiFetch('/api/lexicon/cache-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ciphertext,
            burnAfterReading: true,
            ttl
          })
        });
        const dropData = await res.json().catch(() => ({}));
        if (!res.ok || !dropData.id) {
          showToast(dropData.error || 'Không thể lưu bản mã vào RAM máy chủ.', 'error');
          return;
        }

        const handoverCode = `${dropData.id}#${keyBase64Url}`;
        activeOrder = {
          orderId: dropData.id,
          product,
          xmrAddress: handoverCode,
          hasPin: Boolean(passphrase),
          ttl,
          createdAt: Date.now(),
          expiresAt: dropData.expiresAt || (Date.now() + ttl * 1000)
        };

        if (secretInput) secretInput.value = '';
        if (pinInput) pinInput.value = '';
        displayOrderResult(activeOrder);
        updateRamMonitor();
        showToast('Đã mã hóa AES-256-GCM và lưu bản mã tự hủy 1 lần trên RAM!', 'success');
      } catch (err) {
        showToast(`Lỗi mã hóa AES-256-GCM: ${err?.message || 'Không xác định'}`, 'error');
      } finally {
        createOrderBtn.disabled = false;
      }
    });
  }

  // Real AES-256-GCM Burn-After-Reading Decrypt Form
  const decryptForm = document.getElementById('handover-decrypt-form');
  if (decryptForm) {
    decryptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawCode = (document.getElementById('decrypt-drop-token-input')?.value || '').trim();
      const pin = (document.getElementById('decrypt-drop-pin-input')?.value || '').trim();
      const outBox = document.getElementById('decrypted-secret-box');
      const outMeta = document.getElementById('decrypted-secret-meta');
      const outPre = document.getElementById('decrypted-secret-output');
      const btn = document.getElementById('decrypt-drop-btn');

      let cleanCode = rawCode;
      if (cleanCode.includes('?token=')) {
        cleanCode = cleanCode.split('?token=').pop();
      }
      const parts = cleanCode.split('#');
      if (parts.length !== 2 || !/^[a-f0-9]{32}$/i.test(parts[0].trim()) || !parts[1].trim()) {
        showToast('Mã nhận không đúng định dạng <32-hex-dropId>#<aesKey>!', 'warning');
        return;
      }

      const dropId = parts[0].trim().toLowerCase();
      const keyStr = parts[1].trim();

      if (btn) btn.disabled = true;
      try {
        const res = await bazaarApiFetch(`/api/lexicon/cache-entry/${encodeURIComponent(dropId)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        if (res.status === 404) {
          if (outBox) outBox.style.display = 'none';
          showToast('Bản mã không tồn tại hoặc đã TỰ HỦY khỏi RAM sau lần đọc trước!', 'error');
          return;
        }
        if (!res.ok) {
          showToast('Không thể lấy bản mã từ RAM máy chủ.', 'error');
          return;
        }
        const data = await res.json();
        const key = await importKeyFromBase64Url(keyStr);
        const cipherBytes = base64UrlToBuffer(data.ciphertext);
        const plainStr = await decryptPayload(cipherBytes, key, {
          passphrase: pin || ''
        });

        let displayText = plainStr;
        let metaText = 'Đã giải mã AES-256-GCM · Bản mã trên RAM đã tự hủy vĩnh viễn!';
        try {
          const parsed = JSON.parse(plainStr);
          if (parsed && parsed.secretText) {
            displayText = parsed.secretText;
            metaText = `Dự án: ${parsed.projectName || 'Nội bộ'} · Người gửi: ${parsed.senderName || 'Đồng nghiệp'} · Đã tự hủy khỏi RAM`;
          }
        } catch {}

        if (outMeta) outMeta.textContent = metaText;
        if (outPre) outPre.textContent = displayText;
        if (outBox) outBox.style.display = 'block';
        showToast('Giải mã thành công! Bản mã trên máy chủ đã bị xóa vĩnh viễn.', 'success');
      } catch (err) {
        showToast('Giải mã thất bại! Kiểm tra lại mã khóa hoặc mã PIN lớp 2 (dữ liệu đã tự hủy khỏi RAM).', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  const copyDecryptedBtn = document.getElementById('copy-decrypted-secret-btn');
  if (copyDecryptedBtn) {
    copyDecryptedBtn.addEventListener('click', () => {
      const txt = document.getElementById('decrypted-secret-output')?.textContent || '';
      if (txt && navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(() => {
          showToast('Đã sao chép nội dung đã giải mã!', 'success');
        });
      }
    });
  }

  // Restore active order from storage on F5 reload if still valid
  try {
    const rawOrder = localStorage.getItem(STORAGE_KEYS.ACTIVE_ORDER) || sessionStorage.getItem(STORAGE_KEYS.ACTIVE_ORDER);
    if (rawOrder) {
      const parsedOrder = JSON.parse(rawOrder);
      if (parsedOrder && parsedOrder.expiresAt && parsedOrder.expiresAt > Date.now()) {
        activeOrder = parsedOrder;
        displayOrderResult(activeOrder);
      } else {
        saveActiveOrderToStorage();
      }
    }
  } catch {}

  if (clearOrderBtn) {
    clearOrderBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      if (pubkeyInput) pubkeyInput.value = '';
    });
  }

  if (completeOrderBurnBtn) {
    completeOrderBurnBtn.addEventListener('click', () => {
      const code = document.getElementById('receipt-xmr-address')?.value || '';
      const targetInput = document.getElementById('decrypt-drop-token-input');
      if (targetInput && code) {
        targetInput.value = code;
        targetInput.focus();
        showToast('Đã nạp mã nhận vào khung Giải mã bên trên — bấm Giải mã để kiểm chứng tự hủy 1 lần!', 'info');
      }
    });
  }

  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', () => {
      activeOrder = null;
      saveActiveOrderToStorage();
      if (orderCountdownTimer) clearInterval(orderCountdownTimer);
      const resultBox = document.getElementById('order-result-box');
      if (resultBox) resultBox.style.display = 'none';
      updateRamMonitor();
      showToast('Đã hủy phiếu bàn giao và xóa sạch khỏi RAM!', 'info');
    });
  }

  if (copyXmrBtn) {
    copyXmrBtn.addEventListener('click', () => {
      const addrInput = document.getElementById('receipt-xmr-address');
      if (addrInput && navigator.clipboard) {
        navigator.clipboard.writeText(addrInput.value).then(() => {
          showToast('Đã sao chép mã Token bàn giao nội bộ!', 'success');
        });
      }
    });
  }

  if (showQrBtn) {
    showQrBtn.addEventListener('click', () => {
      if (!activeOrder) return;
      const qrBox = document.getElementById('qr-code-box');
      const qrOverlay = document.getElementById('qr-modal-overlay');
      if (qrBox && qrOverlay) {
        qrBox.innerHTML = '';
        const qr = qrcode(0, 'M');
        qr.addData(`nexus-handover:${activeOrder.orderId}?token=${activeOrder.xmrAddress}`);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag(6, 0);
        openAccessibleModal(qrOverlay, '#close-qr-btn');
      }
    });
  }

  if (chatAboutOrderBtn) {
    chatAboutOrderBtn.addEventListener('click', () => {
      if (!activeOrder) return;
      initiateChatForProduct(activeOrder.product.name, activeOrder.product.id);
    });
  }
}

function displayOrderResult(order) {
  const resultBox = document.getElementById('order-result-box');
  const orderIdEl = document.getElementById('receipt-order-id');
  const prodNameEl = document.getElementById('receipt-product-name');
  const amountEl = document.getElementById('receipt-amount-xmr');
  const countdownEl = document.getElementById('receipt-expiry-countdown');
  const xmrAddrInput = document.getElementById('receipt-xmr-address');
  const progressBar = document.getElementById('order-progress-bar');

  if (!resultBox) return;

  if (orderIdEl) orderIdEl.textContent = order.orderId;
  if (prodNameEl) prodNameEl.textContent = `${order.product.name} (${order.product.approxUSD})`;
  if (amountEl) amountEl.textContent = order.hasPin ? 'Có PIN (PBKDF2 100k vòng)' : 'Khóa AES-256-GCM (Không PIN)';
  if (xmrAddrInput) xmrAddrInput.value = order.xmrAddress;

  resultBox.style.display = 'block';

  // Start countdown timer
  if (orderCountdownTimer) clearInterval(orderCountdownTimer);
  orderCountdownTimer = setInterval(() => {
    const totalDuration = order.ttl;
    const remaining = Math.max(0, Math.floor((order.expiresAt - Date.now()) / 1000));
    if (countdownEl) countdownEl.textContent = `${remaining}s`;

    if (progressBar) {
      const percentage = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
      progressBar.style.transform = `scaleX(${percentage / 100})`;
      if (percentage < 20) {
        progressBar.style.backgroundColor = '#ef4444';
      } else if (percentage < 50) {
        progressBar.style.backgroundColor = '#f59e0b';
      } else {
        progressBar.style.backgroundColor = '#10b981';
      }
    }

    if (remaining <= 0) {
      clearInterval(orderCountdownTimer);
      activeOrder = null;
      resultBox.style.display = 'none';
      updateRamMonitor();
      showToast('Phiếu bàn giao đã hết hạn TTL và tự hủy khỏi RAM!', 'error');
    }
  }, 1000);
}

/* ==========================================================================
   7. LIVE RAM ALLOCATION MONITOR (IN AUDIT TAB)
   ========================================================================== */

function updateRamMonitor() {
  const chatBytesEl = document.getElementById('ram-chat-bytes');
  const orderBytesEl = document.getElementById('ram-order-bytes');

  if (chatBytesEl) {
    const chatJson = JSON.stringify(inMemoryChatMessages);
    const chatBytes = new TextEncoder().encode(chatJson).length;
    chatBytesEl.textContent = `${chatBytes} Bytes (${inMemoryChatMessages.length} tin)`;
  }

  if (orderBytesEl) {
    if (activeOrder) {
      const orderJson = JSON.stringify(activeOrder);
      const orderBytes = new TextEncoder().encode(orderJson).length;
      orderBytesEl.textContent = `${orderBytes} Bytes (1 đơn ký quỹ)`;
    } else {
      orderBytesEl.textContent = '0 Bytes (Trống)';
    }
  }
}

/* ==========================================================================
   8. EPHEMERAL AUCTION BIDDING & LIVE COUNTDOWN TIMER
   ========================================================================== */

let activeBiddingProductId = null;
let auctionIntervalTimer = null;

function updateAuctionCountdowns() {
  const pills = document.querySelectorAll('.auction-countdown-pill');
  const now = Date.now();

  pills.forEach(pill => {
    const end = parseInt(pill.getAttribute('data-end') || '0', 10);
    const countdownVal = pill.querySelector('.countdown-val');

    if (end === 0) {
      if (countdownVal) countdownVal.textContent = 'Mở liên tục';
      return;
    }

    const diff = Math.max(0, Math.floor((end - now) / 1000));

    if (diff <= 0) {
      if (countdownVal) countdownVal.textContent = 'Đang mở';
      return;
    }

    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;

    const formatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (countdownVal) countdownVal.textContent = formatted;
  });
}

function estimateUSDString(val, currency = 'Giờ') {
  const num = Number(val) || 0;
  if (currency === 'VNĐ') return `~${Math.round(num).toLocaleString('en-US')} VNĐ`;
  return `${formatPriceNum(num)} ${currency} • Nội bộ công ty`;
}

function initAuctionBidding() {
  if (auctionIntervalTimer) clearInterval(auctionIntervalTimer);
  auctionIntervalTimer = setInterval(updateAuctionCountdowns, 1000);

  const modalOverlay = document.getElementById('bid-modal-overlay');
  const closeBtn = document.getElementById('close-bid-modal-btn');
  const cancelBtn = document.getElementById('cancel-bid-modal-btn');
  const buyoutBtn = document.getElementById('buyout-from-bid-btn');
  const submitBtn = document.getElementById('submit-bid-btn');
  const bidInput = document.getElementById('bid-amount-input');
  const quickStepBtns = document.querySelectorAll('.quick-bid-step-btn');

  const closeModal = () => {
    activeBiddingProductId = null;
    closeAccessibleModal(modalOverlay);
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  if (buyoutBtn) {
    buyoutBtn.addEventListener('click', () => {
      if (!activeBiddingProductId) return;
      const targetId = activeBiddingProductId;
      closeModal();
      initiateOrderForProduct(targetId);
    });
  }

  quickStepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeBiddingProductId || !bidInput) return;
      const product = MARKET_PRODUCTS.find(p => p.id === activeBiddingProductId);
      if (!product) return;
      const mult = parseFloat(btn.getAttribute('data-mult') || '1.1');
      const base = product.currentBidXMR || product.startingBidXMR || product.rawPriceXMR || 0.1;
      const nextVal = Math.max(0.01, base * mult);
      bidInput.value = nextVal.toFixed(2);
      const usdEl = document.getElementById('bid-usd-approx');
      if (usdEl) usdEl.textContent = estimateUSDString(nextVal, product.currency || 'XMR');
    });
  });

  if (bidInput) {
    bidInput.addEventListener('input', () => {
      const val = parseFloat(bidInput.value) || 0;
      const product = MARKET_PRODUCTS.find(p => p.id === activeBiddingProductId);
      const currency = product?.currency || 'XMR';
      const usdEl = document.getElementById('bid-usd-approx');
      if (usdEl) {
        usdEl.textContent = estimateUSDString(val, currency);
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!activeBiddingProductId) return;
      const product = MARKET_PRODUCTS.find(p => p.id === activeBiddingProductId);
      if (!product) return;

      const currency = product.currency || 'XMR';
      const bidVal = parseFloat(bidInput?.value || '0');
      const minStep = Number(product.minBidIncrement || 0);
      const currentBid = Number(product.currentBidXMR ?? product.startingBidXMR ?? product.rawPriceXMR ?? 0);

      if (isNaN(bidVal) || bidVal <= 0) {
        showToast('Vui lòng nhập mức giá hợp lệ lớn hơn 0!', 'error');
        return;
      }

      if (minStep > 0 && bidVal < currentBid + minStep) {
        showToast(`Mặt hàng này yêu cầu bước giá tối thiểu +${minStep} ${currency} (từ ${(currentBid + minStep).toFixed(2)} ${currency})!`, 'error');
        return;
      }

      // Synchronize bid with server RAM
      let updatedFromServer = null;
      try {
        const res = await bazaarApiFetch(`/api/lexicon/bazaar-items/${encodeURIComponent(product.id)}/bid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bidder: anonymousAlias,
            amount: bidVal,
            currency
          })
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.product) {
            updatedFromServer = resData.product;
          }
        }
      } catch (err) {
        console.warn('Bid sync failed, updating local state:', err);
      }

      if (updatedFromServer) {
        const pIdx = MARKET_PRODUCTS.findIndex(p => p.id === product.id);
        if (pIdx !== -1) {
          MARKET_PRODUCTS[pIdx] = updatedFromServer;
        }
      } else {
        // Fallback local memory update
        product.isAuction = true;
        product.bidCount = (product.bidCount || 0) + 1;

        if (bidVal >= currentBid) {
          product.currentBidXMR = bidVal;
          product.rawPriceXMR = bidVal;
          product.highestBidder = anonymousAlias;
          product.priceXMR = `${formatPriceNum(bidVal)} ${currency}`;
          product.approxUSD = estimateUSDString(bidVal, currency);
        }

        if (!product.bids) product.bids = [];
        product.bids.unshift({
          bidder: anonymousAlias,
          amount: bidVal,
          currency,
          note: bidVal >= currentBid ? 'Dẫn đầu' : 'Trả giá tự do',
          time: 'Vừa xong'
        });
      }

      saveMarketProductsToStorage();
      populateOrderProductSelect(MARKET_PRODUCTS);

      // Broadcast bid across local tabs/desks & P2P connected peers
      if (bazaarSyncChannel) {
        try {
          bazaarSyncChannel.postMessage({
            type: 'BID_PLACED',
            productId: product.id,
            amount: bidVal,
            currency,
            bidder: anonymousAlias
          });
        } catch {}
      }

      if (isP2PConnected && activePeerConnection) {
        try {
          activePeerConnection.send({
            type: 'market_bid_placed',
            productId: product.id,
            amount: bidVal,
            currency,
            bidder: anonymousAlias
          });
        } catch {}
      }

      showToast(`Đã gửi đề xuất ${formatPriceNum(bidVal)} ${currency} cho "${product.name}"!`, 'success');
      closeModal();
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    });
  }
}

function openBidModal(productId) {
  const product = MARKET_PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  activeBiddingProductId = productId;
  const modalOverlay = document.getElementById('bid-modal-overlay');
  const infoBox = document.getElementById('bid-modal-item-info');
  const bidInput = document.getElementById('bid-amount-input');
  const currencyTag = document.getElementById('bid-currency-tag');
  const hintEl = document.getElementById('bid-min-hint');
  const aliasEl = document.getElementById('bid-client-alias');
  const feedEl = document.getElementById('bid-history-feed');

  const currency = product.currency || 'Giờ';
  if (aliasEl) aliasEl.textContent = anonymousAlias;
  if (currencyTag) currencyTag.textContent = currency;

  const currentBid = Number(product.currentBidXMR ?? product.startingBidXMR ?? product.rawPriceXMR ?? 1);
  const buyNowVal = Number(product.buyNowPrice ?? product.rawPriceXMR ?? currentBid);
  const minStep = Number(product.minBidIncrement || 0);
  const suggestedBid = minStep > 0 ? (currentBid + minStep) : Math.ceil(currentBid * 1.1);

  if (infoBox) {
    infoBox.innerHTML = `
      <div class="bid-info-title-row">
        <span style="font-size: 1.35rem;" aria-hidden="true">${escapeHtml(product.icon)}</span>
        <span class="bid-info-title">${escapeHtml(product.name)}</span>
      </div>
      <div class="bid-info-price-grid">
        <div class="bid-price-cell">
          <span class="detail-label">Mức đề xuất hiện tại:</span>
          <span style="font-weight: 700; color: #38bdf8; font-variant-numeric: tabular-nums;">${formatPriceNum(currentBid)} ${escapeHtml(currency)}</span>
        </div>
        <div class="bid-price-cell">
          <span class="detail-label">Hạn mức / Người đề xuất:</span>
          <span style="font-weight: 600; color: #cbd5e1; font-variant-numeric: tabular-nums;">${formatPriceNum(buyNowVal)} ${escapeHtml(currency)} · ${escapeHtml(product.highestBidder || 'Mở tự do')}</span>
        </div>
      </div>
    `;
  }

  if (bidInput) {
    bidInput.value = Number.isInteger(suggestedBid) ? String(suggestedBid) : suggestedBid.toFixed(1);
    bidInput.min = '0';
    const usdEl = document.getElementById('bid-usd-approx');
    if (usdEl) usdEl.textContent = estimateUSDString(suggestedBid, currency);
  }

  if (hintEl) {
    hintEl.textContent = minStep > 0
      ? `Mức điều chỉnh tối thiểu: +${minStep} ${currency} (Gợi ý: ${formatPriceNum(suggestedBid)} ${currency})`
      : `Tự do đề xuất — Nhập ước lượng của bạn theo đơn vị ${currency}`;
  }

  if (feedEl) {
    const bids = product.bids || [];
    if (bids.length === 0) {
      feedEl.innerHTML = '<div style="font-size: 0.76rem; color: #94a3b8; font-style: italic;">Chưa có đề xuất nào từ các phòng ban. Hãy là người đầu tiên đóng góp ước lượng!</div>';
    } else {
      feedEl.innerHTML = bids.map(b => `
        <div class="bid-feed-item">
          <span class="bid-feed-bidder">${escapeHtml(b.bidder)}</span>
          <span class="bid-feed-amount">${typeof b.amount === 'number' ? formatPriceNum(b.amount) : escapeHtml(String(b.amount))} ${escapeHtml(b.currency || currency)}</span>
          <span class="bid-feed-time">${escapeHtml(b.time || 'Vừa xong')}</span>
        </div>
      `).join('');
    }
  }

  if (modalOverlay) {
    openAccessibleModal(modalOverlay, '#bid-amount-input');
  }
}

/* ==========================================================================
   9. VENDOR DESK: UNRESTRICTED LISTING & AUCTION CREATION
   ========================================================================== */

let myVendorListings = [];
let currentListingMode = 'hybrid';

const CATEGORY_DEFAULT_BADGES = {
  physical: 'Thiết Bị VP',
  digital: 'Tài Nguyên Số',
  service: 'Phối Hợp Nhóm',
  hardware: 'DevOps & Phần Cứng',
  network: 'Hạ Tầng Mạng',
  crypto: 'API & Mật Khẩu',
  audit: 'Tài Liệu Audit'
};

function initVendorDesk() {
  const emojiPicker = document.getElementById('emoji-quick-picker');
  const iconInput = document.getElementById('listing-icon-val');
  const publishBtn = document.getElementById('publish-listing-btn');
  const resetBtn = document.getElementById('reset-listing-btn');

  // Input listeners for real-time live preview
  const liveInputs = [
    'listing-department', 'listing-name', 'listing-security-tag',
    'listing-due-date', 'listing-price-xmr', 'listing-currency',
    'listing-icon-val', 'listing-desc', 'listing-spec1-v', 'listing-spec2-v'
  ];

  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateVendorLivePreview);
      el.addEventListener('change', updateVendorLivePreview);
    }
  });

  // Emoji picker + custom emoji input
  if (emojiPicker && iconInput) {
    emojiPicker.querySelectorAll('.emoji-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        emojiPicker.querySelectorAll('.emoji-opt').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        iconInput.value = btn.getAttribute('data-icon') || '📌';
        updateVendorLivePreview();
      });
    });
  }

  // Reset Button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const nameInp = document.getElementById('listing-name');
      const dueInp = document.getElementById('listing-due-date');
      const descInp = document.getElementById('listing-desc');
      const priceInp = document.getElementById('listing-price-xmr');
      const prioSel = document.getElementById('listing-security-tag');
      if (nameInp) nameInp.value = '';
      if (dueInp) dueInp.value = '';
      if (descInp) descInp.value = '';
      if (priceInp) priceInp.value = '16';
      if (prioSel) prioSel.value = 'Ưu tiên Trung bình';
      updateVendorLivePreview();
      showToast('Đã làm mới biểu mẫu tạo dự án', 'info');
    });
  }

  // Publish Button
  if (publishBtn) {
    publishBtn.addEventListener('click', handlePublishListing);
  }

  updateVendorLivePreview();
  renderMyListings();
}

function updateVendorLivePreview() {
  const previewContainer = document.getElementById('live-vendor-preview');
  if (!previewContainer) return;

  const deptVal = isCompanyAuthActive() && currentCompanyState.user.role !== 'director'
    ? currentCompanyState.user.department
    : (document.getElementById('listing-department')?.value || 'devops');
  const deptMeta = DEPT_DISPLAY_META[deptVal] || { badge: 'Ban DevOps', category: 'hardware' };
  const name = (document.getElementById('listing-name')?.value || '').trim() || 'Tên dự án / Đầu việc nội bộ';
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '📌';
  const currency = document.getElementById('listing-currency')?.value || 'Giờ';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Ưu tiên Trung bình';
  const dueDate = (document.getElementById('listing-due-date')?.value || '').trim();
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Mô tả mục tiêu, phạm vi kỹ thuật và tiêu chí nghiệm thu của dự án trong phòng ban...';
  const spec1 = (document.getElementById('listing-spec1-v')?.value || '').trim() || 'Trưởng ban phụ trách';
  const spec2 = (document.getElementById('listing-spec2-v')?.value || '').trim() || 'Phòng chat ban & Bàn giao AES-256';
  const workload = parseFloat(document.getElementById('listing-price-xmr')?.value || '16') || 0;
  const prioClass = getPriorityBadgeClass(secTag);

  previewContainer.innerHTML = `
    <article class="product-card" style="box-shadow: none; margin: 0;">
      <div class="product-card-top">
        <div class="product-badge-group">
          <span class="dept-chip ${escapeHtml(deptMeta.category)}">
            <span class="dept-dot" aria-hidden="true"></span>
            ${escapeHtml(deptMeta.badge)}
          </span>
        </div>
        <div class="project-priority-group">
          <span class="project-priority-pill ${prioClass}">${escapeHtml(secTag)}</span>
          ${dueDate ? `<span class="project-due-pill">${SVG_ICONS.clock} ${escapeHtml(dueDate)}</span>` : ''}
        </div>
      </div>

      <div class="product-main-body">
        <div class="product-title-row">
          <div class="product-icon-box" aria-hidden="true">${escapeHtml(icon)}</div>
          <h4 class="product-title">${escapeHtml(name)}</h4>
        </div>
        <p class="product-desc">${escapeHtml(desc)}</p>
        <div class="project-task-meta-row">
          <span class="task-status-badge status-todo">Chưa giao</span>
          <span class="task-assignee-text"><span>Chưa phân công người phụ trách</span></span>
        </div>
        <p class="product-specs-inline">${escapeHtml(spec1)} · ${escapeHtml(spec2)}</p>
      </div>

      <div class="product-card-footer">
        <div class="product-price-block">
          <span class="product-price auction-price">${formatPriceNum(workload)} ${escapeHtml(currency)}</span>
          <span class="product-bid-meta">Khối lượng ước lượng</span>
        </div>
        <div class="product-actions">
          <button type="button" class="assign-task-btn" tabindex="-1" style="pointer-events: none;">${SVG_ICONS.edit} <span>Giao việc</span></button>
          <button type="button" class="buy-btn" tabindex="-1" style="pointer-events: none;">${SVG_ICONS.check} <span>Bàn giao</span></button>
        </div>
      </div>
    </article>
  `;
}

async function handlePublishListing() {
  const nameEl = document.getElementById('listing-name');
  const rawName = (nameEl?.value || '').trim();
  if (!rawName) {
    showToast('Vui lòng nhập tên dự án / đầu việc trước khi khởi tạo.', 'warning');
    nameEl?.focus();
    return;
  }

  const deptSelect = document.getElementById('listing-department');
  const chosenDept = isCompanyAuthActive()
    ? (currentCompanyState.user.role === 'director' ? (deptSelect?.value || 'devops') : currentCompanyState.user.department)
    : (deptSelect?.value || 'devops');
  const deptMeta = DEPT_DISPLAY_META[chosenDept] || { badge: 'Ban DevOps', category: 'hardware' };

  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '📌';
  const currency = document.getElementById('listing-currency')?.value || 'Giờ';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Ưu tiên Trung bình';
  const dueDate = (document.getElementById('listing-due-date')?.value || '').trim();
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Dự án nội bộ được khởi tạo trong hệ thống Nexus Workspace.';
  const spec1 = (document.getElementById('listing-spec1-v')?.value || '').trim() || 'Trưởng ban phụ trách';
  const spec2 = (document.getElementById('listing-spec2-v')?.value || '').trim() || 'Phòng chat ban & Bàn giao AES-256';
  const workloadInput = parseFloat(document.getElementById('listing-price-xmr')?.value || '16');
  const workload = isNaN(workloadInput) ? 16 : Math.max(0, workloadInput);

  let payload = {
    name: rawName,
    department: chosenDept,
    category: deptMeta.category,
    badge: deptMeta.badge,
    icon,
    securityLevel: secTag,
    dueDate,
    currency,
    isAuction: false,
    auctionEndTime: 0,
    rawPriceXMR: workload,
    currentBidXMR: workload,
    buyNowPrice: workload,
    priceXMR: `${formatPriceNum(workload)} ${currency}`,
    desc,
    specs: {
      'Phụ trách': spec1,
      'Kênh bàn giao': spec2
    }
  };

  if (isCompanyAuthActive()) {
    try {
      const res = await bazaarApiFetch('/api/company/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Bạn không có quyền tạo dự án mới.', 'error');
        return;
      }
      if (data && data.project) {
        payload = data.project;
      }
      await fetchCompanyState(true);
    } catch {
      showToast('Không thể kết nối máy chủ để khởi tạo dự án.', 'error');
      return;
    }
  } else {
    showToast('Vui lòng đăng nhập tài khoản Quản lí hoặc Giám đốc để tạo dự án.', 'warning');
    return;
  }

  // Reset form inputs
  if (nameEl) nameEl.value = '';
  const dueEl = document.getElementById('listing-due-date');
  if (dueEl) dueEl.value = '';
  const descEl = document.getElementById('listing-desc');
  if (descEl) descEl.value = '';
  updateVendorLivePreview();

  showToast(`Đã khởi tạo dự án "${payload.name}" và đồng bộ realtime qua WebSocket!`, 'success');
}

function renderMyListings() {
  const container = document.getElementById('my-listings-list');
  if (!container) return;

  if (myVendorListings.length === 0) {
    container.innerHTML = '<p class="empty-listings-note">Bạn chưa khởi tạo dự án nào trong phòng ban này.</p>';
    return;
  }

  container.innerHTML = myVendorListings.map(item => {
    const currency = item.currency || 'Giờ';
    const deptMeta = DEPT_DISPLAY_META[item.department] || { badge: item.badge || 'Nội bộ', category: item.category || 'hardware' };
    const prioClass = getPriorityBadgeClass(item.securityLevel);
    const workloadVal = item.rawPriceXMR ?? item.currentBidXMR ?? 0;
    return `
      <div class="my-listing-card" id="my-item-${escapeHtml(item.id)}">
        <div class="my-listing-top">
          <div class="my-listing-title-row">
            <span class="my-listing-icon">${escapeHtml(item.icon)}</span>
            <span class="my-listing-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="dept-chip ${escapeHtml(deptMeta.category)}">
            <span class="dept-dot" aria-hidden="true"></span>
            ${escapeHtml(item.badge || deptMeta.badge)}
          </span>
        </div>

        <div class="my-listing-meta-row">
          <span>Ước lượng: <strong style="color: #38bdf8;">${formatPriceNum(workloadVal)} ${escapeHtml(currency)}</strong></span>
          <span class="project-priority-pill ${prioClass}">${escapeHtml(item.securityLevel || 'Ưu tiên Trung bình')}</span>
          ${item.dueDate ? `<span class="project-due-pill">${SVG_ICONS.clock} ${escapeHtml(item.dueDate)}</span>` : ''}
        </div>

        <button type="button" class="revoke-listing-btn" data-id="${escapeHtml(item.id)}">
          ${SVG_ICONS.trash} <span>Thu hồi dự án</span>
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.revoke-listing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      revokeUserListing(prodId);
    });
  });
}

async function revokeUserListing(productId) {
  const itemInVendor = myVendorListings.find(p => p.id === productId);
  const itemInMarket = MARKET_PRODUCTS.find(p => p.id === productId);
  const prodName = itemInVendor?.name || itemInMarket?.name || 'Dự án';

  if (isCompanyAuthActive()) {
    if (!window.confirm(`Thu hồi dự án "${prodName}" khỏi hệ thống phòng ban?`)) return;
    try {
      const res = await bazaarApiFetch(`/api/company/projects/${encodeURIComponent(productId)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Bạn không có quyền thu hồi dự án này.', 'error');
        return;
      }
      showToast(`Đã thu hồi dự án "${prodName}" thành công!`, 'success');
      await fetchCompanyState(true);
    } catch {
      showToast('Lỗi kết nối máy chủ khi thu hồi dự án.', 'error');
    }
    return;
  }

  const killToken = itemInVendor?.vendorKillToken || itemInMarket?.vendorKillToken || '';
  addRevokedProductId(productId);
  try {
    await bazaarApiFetch(`/api/lexicon/bazaar-items/${encodeURIComponent(productId)}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorKillToken: killToken })
    });
  } catch {}

  MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== productId);
  myVendorListings = myVendorListings.filter(p => p.id !== productId);
  populateOrderProductSelect(MARKET_PRODUCTS);
  filterAndRenderProducts();
  renderMyListings();
  showToast(`Đã thu hồi dự án "${prodName}"!`, 'info');
}


/* ==========================================================================
   10. CLOSED-COMPANY 3-ROLE RBAC CONTROLLER (EMPLOYEE • MANAGER • DIRECTOR)
   ========================================================================== */

async function initCompanyBootFlow() {
  bindAuthGateEvents();
  await loadQuickLoginDirectory();

  let savedToken = null;
  try {
    savedToken = sessionStorage.getItem(COMPANY_TOKEN_KEY);
  } catch {}

  if (savedToken) {
    companyAuthToken = savedToken;
    const restored = await fetchCompanyState(true);
    if (restored) {
      enterAuthenticatedWorkspace();
      return;
    }
  }

  showAuthGate();
}

function bindAuthGateEvents() {
  const loginForm = document.getElementById('company-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('login-username')?.value || '').trim();
      const password = document.getElementById('login-password')?.value || '';
      await performCompanyLogin(username, password);
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logoutCompanySession('Đã đăng xuất phiên hiện tại.');
    });
  }

  const togglePwdBtn = document.getElementById('toggle-login-password-btn');
  const pwdInput = document.getElementById('login-password');
  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isHidden = pwdInput.type === 'password';
      pwdInput.type = isHidden ? 'text' : 'password';
      togglePwdBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
    });
  }

  const quickDirSearch = document.getElementById('quick-dir-search');
  if (quickDirSearch) {
    quickDirSearch.addEventListener('input', () => {
      renderQuickLoginDirectory(accountsDirectoryCache);
    });
  }
}

async function loadQuickLoginDirectory() {
  const container = document.getElementById('quick-login-directory');
  if (!container) return;

  try {
    const res = await bazaarApiFetch('/api/company/accounts-directory', {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    accountsDirectoryCache = accounts;
    renderQuickLoginDirectory(accounts);
  } catch {
    container.innerHTML = '<p class="auth-loading-note">Không thể tải danh bạ tài khoản từ máy chủ.</p>';
  }
}

function renderQuickLoginDirectory(accounts) {
  const container = document.getElementById('quick-login-directory');
  if (!container) return;

  const kw = (document.getElementById('quick-dir-search')?.value || '').trim().toLowerCase();
  const filteredAccounts = kw
    ? accounts.filter(a =>
        a.name.toLowerCase().includes(kw) ||
        a.username.toLowerCase().includes(kw) ||
        (a.title || '').toLowerCase().includes(kw) ||
        (a.departmentName || '').toLowerCase().includes(kw)
      )
    : accounts;

  const groups = [
    { role: 'director', label: 'Cấp 1 · Giám Đốc Điều Hành' },
    { role: 'manager', label: 'Cấp 2 · Quản Lí Phòng Ban' },
    { role: 'employee', label: 'Cấp 3 · Nhân Viên Các Ban' }
  ];

  const html = groups.map(group => {
    const items = filteredAccounts.filter(a => a.role === group.role);
    if (items.length === 0) return '';
    return `
      <div class="quick-role-group">
        <div class="quick-role-group-title">${escapeHtml(group.label)} (${items.length})</div>
        <div class="quick-role-cards">
          ${items.map(acc => `
            <button type="button" class="quick-account-btn role-${escapeHtml(acc.role)} ${acc.active === false ? 'is-locked' : ''}" data-username="${escapeHtml(acc.username)}">
              <span class="qa-main">
                <strong class="qa-name">${escapeHtml(acc.name)} ${acc.active === false ? '<span class="qa-locked-tag">(Đã khóa)</span>' : ''}</strong>
                <span class="qa-meta">${escapeHtml(acc.title)} · ${escapeHtml(acc.departmentName)}</span>
              </span>
              <code class="qa-user">${escapeHtml(acc.username)}</code>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html || '<p class="auth-loading-note">Không tìm thấy tài khoản phù hợp.</p>';

  container.querySelectorAll('.quick-account-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uname = btn.getAttribute('data-username') || '';
      const uInput = document.getElementById('login-username');
      const pInput = document.getElementById('login-password');
      if (uInput) uInput.value = uname;
      if (pInput && !pInput.value) pInput.value = '123';
      await performCompanyLogin(uname, pInput?.value || '123');
    });
  });
}

async function performCompanyLogin(username, password) {
  const errBox = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('login-submit-btn');
  if (errBox) {
    errBox.style.display = 'none';
    errBox.textContent = '';
  }
  if (!username) {
    if (errBox) {
      errBox.textContent = 'Vui lòng nhập tên đăng nhập nội bộ.';
      errBox.style.display = 'block';
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await bazaarApiFetch('/api/company/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      if (errBox) {
        errBox.textContent = data.error || 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản.';
        errBox.style.display = 'block';
      }
      return;
    }

    companyAuthToken = data.token;
    try {
      sessionStorage.setItem(COMPANY_TOKEN_KEY, companyAuthToken);
      sessionStorage.removeItem(STORAGE_KEYS.MARKET_PRODUCTS);
      sessionStorage.removeItem(STORAGE_KEYS.MY_LISTINGS);
      sessionStorage.removeItem('nexus_threads_v3');
      sessionStorage.removeItem('nexus_active_thread_v3');
    } catch {}

    lastProjectsSig = '';
    lastRoomsSig = '';
    lastApprovalsSig = '';
    lastManagersSig = '';
    lastTeamSig = '';
    lastAuditSig = '';

    enterAuthenticatedWorkspace(data);
    showToast(`Xin chào ${data.user.name} (${ROLE_LABELS_VI[data.user.role] || data.user.role})!`, 'success');
  } catch {
    if (errBox) {
      errBox.textContent = 'Không thể kết nối đến máy chủ nội bộ.';
      errBox.style.display = 'block';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function showAuthGate(noticeMessage = '') {
  if (companyPollTimer) {
    clearInterval(companyPollTimer);
    companyPollTimer = null;
  }
  companyAuthToken = null;
  currentCompanyState = null;

  const authGate = document.getElementById('auth-gate');
  const vaultShell = document.getElementById('vault-shell');
  if (vaultShell) {
    vaultShell.hidden = true;
    vaultShell.style.display = 'none';
  }
  if (authGate) {
    authGate.hidden = false;
    authGate.style.display = '';
  }

  const errBox = document.getElementById('login-error-msg');
  if (errBox) {
    if (noticeMessage) {
      errBox.textContent = noticeMessage;
      errBox.style.display = 'block';
    } else {
      errBox.style.display = 'none';
      errBox.textContent = '';
    }
  }
  loadQuickLoginDirectory();
  setTimeout(() => {
    document.getElementById('login-username')?.focus();
  }, 30);
}

function enterAuthenticatedWorkspace(initialState = null) {
  const authGate = document.getElementById('auth-gate');
  const vaultShell = document.getElementById('vault-shell');
  if (authGate) {
    authGate.hidden = true;
    authGate.style.display = 'none';
  }
  if (vaultShell) {
    vaultShell.hidden = false;
    vaultShell.style.display = '';
  }

  initWorkspaceModulesOnce();
  if (initialState) {
    applyCompanyState(initialState);
  }
  switchTab('tab-market');

  connectCompanyWebSocket();
}

async function logoutCompanySession(toastText = '') {
  const tokenToRevoke = companyAuthToken;
  disconnectCompanyWebSocket();
  revokeAllAttachmentBlobs();
  if (tokenToRevoke) {
    try {
      await bazaarApiFetch('/api/company/logout', { method: 'POST' });
    } catch {}
  }

  if (companyPollTimer) {
    clearInterval(companyPollTimer);
    companyPollTimer = null;
  }

  companyAuthToken = null;
  currentCompanyState = null;
  MARKET_PRODUCTS = [];
  chatThreads = [];
  inMemoryChatMessages = [];
  myVendorListings = [];
  lastProjectsSig = '';
  lastRoomsSig = '';
  lastApprovalsSig = '';
  lastManagersSig = '';
  lastTeamSig = '';
  lastAuditSig = '';
  pendingAttachmentPayload = null;
  hideMentionPopup();

  try {
    sessionStorage.removeItem(COMPANY_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_KEYS.MARKET_PRODUCTS);
    sessionStorage.removeItem(STORAGE_KEYS.MY_LISTINGS);
    sessionStorage.removeItem('nexus_threads_v3');
    sessionStorage.removeItem('nexus_active_thread_v3');
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB);
  } catch {}

  showAuthGate();
  if (toastText) showToast(toastText, 'info');
}

async function fetchCompanyState(silent = true) {
  if (!companyAuthToken) return false;
  try {
    const res = await bazaarApiFetch('/api/company/state', {
      headers: { Accept: 'application/json' }
    });
    if (res.status === 401) {
      companyAuthToken = null;
      try { sessionStorage.removeItem(COMPANY_TOKEN_KEY); } catch {}
      showAuthGate('Phiên đăng nhập đã hết hạn hoặc máy chủ vừa khởi động lại. Vui lòng đăng nhập lại.');
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json();
    applyCompanyState(data);
    if (!silent) {
      showToast('Đã đồng bộ dữ liệu phân quyền mới nhất từ máy chủ!', 'success');
    }
    return true;
  } catch {
    return false;
  }
}

function applyCompanyState(state) {
  if (!state || !state.user) return;
  currentCompanyState = state;
  const user = state.user;
  anonymousAlias = user.name;

  // Header Identity Cluster
  const aliasEl = document.getElementById('anon-alias');
  const roleBadgeEl = document.getElementById('user-role-badge');
  const deptLabelEl = document.getElementById('user-dept-label');
  const bidClientAliasEl = document.getElementById('bid-client-alias');
  if (aliasEl) aliasEl.textContent = `${user.name} (@${user.username})`;
  if (bidClientAliasEl) bidClientAliasEl.textContent = `${user.name} · ${user.departmentName}`;
  if (roleBadgeEl) {
    roleBadgeEl.textContent = ROLE_LABELS_VI[user.role] || user.role;
    roleBadgeEl.className = `user-role-pill role-${user.role}`;
  }
  if (deptLabelEl) {
    deptLabelEl.textContent = user.department === 'all' ? 'Toàn Công Ty' : (user.departmentName || user.department);
  }

  // Scope Banner & Nav Visibility
  const navVendor = document.getElementById('nav-tab-vendor');
  const navTeam = document.getElementById('nav-tab-team');
  const navAdmin = document.getElementById('nav-tab-admin');
  const quickOpenVendorBtn = document.getElementById('quick-open-vendor-btn');
  const newThreadBtn = document.getElementById('btn-new-thread');
  const scopeBannerText = document.getElementById('role-scope-text');
  const oversightStrip = document.getElementById('director-oversight-strip');
  const adminPendingBadge = document.getElementById('admin-pending-badge');
  const vendorDeptSelect = document.getElementById('listing-department');
  const vendorDeptLockNote = document.getElementById('vendor-dept-lock-note');

  const pendingApprovals = Array.isArray(state.approvals) ? state.approvals : [];

  if (user.role === 'employee') {
    if (navVendor) navVendor.style.display = 'none';
    if (navTeam) navTeam.style.display = 'none';
    if (navAdmin) navAdmin.style.display = 'none';
    if (quickOpenVendorBtn) quickOpenVendorBtn.style.display = 'none';
    if (newThreadBtn) newThreadBtn.style.display = 'none';
    if (oversightStrip) oversightStrip.style.display = 'none';
    if (scopeBannerText) {
      scopeBannerText.textContent = `Phạm vi Nhân viên (${user.departmentName}): Chỉ được xem các dự án và tham gia phòng chat đã duyệt của ban mình.`;
    }
  } else if (user.role === 'manager') {
    if (navVendor) navVendor.style.display = '';
    if (navTeam) navTeam.style.display = '';
    if (navAdmin) navAdmin.style.display = 'none';
    if (quickOpenVendorBtn) quickOpenVendorBtn.style.display = '';
    if (newThreadBtn) newThreadBtn.style.display = '';
    if (oversightStrip) oversightStrip.style.display = 'none';
    if (vendorDeptSelect) {
      vendorDeptSelect.value = user.department;
      vendorDeptSelect.disabled = true;
    }
    if (vendorDeptLockNote) {
      vendorDeptLockNote.textContent = `Dự án mới sẽ được gắn cố định vào ${user.departmentName} do bạn quản lí.`;
    }
    if (scopeBannerText) {
      scopeBannerText.textContent = `Phạm vi Quản lí (${user.departmentName}): Quản lí dự án trong ban & tạo/yêu cầu xóa phòng chat ban hoặc công việc (Chờ Giám đốc duyệt).`;
    }
  } else if (user.role === 'director') {
    if (navVendor) navVendor.style.display = '';
    if (navTeam) navTeam.style.display = '';
    if (navAdmin) navAdmin.style.display = '';
    if (quickOpenVendorBtn) quickOpenVendorBtn.style.display = '';
    if (newThreadBtn) newThreadBtn.style.display = '';
    if (oversightStrip) oversightStrip.style.display = 'grid';
    if (vendorDeptSelect) vendorDeptSelect.disabled = false;
    if (vendorDeptLockNote) {
      vendorDeptLockNote.textContent = 'Giám đốc có quyền chỉ định bất kỳ phòng ban nào cho dự án mới.';
    }
    if (scopeBannerText) {
      scopeBannerText.textContent = 'Toàn quyền Giám đốc Điều Hành: Giám sát toàn công ty, thêm & điều phối Quản lí, mở phòng QL ↔ QL / QL ↔ GĐ và phê duyệt tạo/xóa phòng chat.';
    }

    const kpiProj = document.getElementById('kpi-projects-count');
    const kpiRooms = document.getElementById('kpi-active-rooms-count');
    const kpiPending = document.getElementById('kpi-pending-approvals-count');
    const kpiMgrs = document.getElementById('kpi-managers-count');
    if (kpiProj) kpiProj.textContent = String((state.projects || []).length);
    if (kpiRooms) kpiRooms.textContent = String((state.rooms || []).filter(r => r.status === 'active').length);
    if (kpiPending) kpiPending.textContent = String(pendingApprovals.length);
    if (kpiMgrs) kpiMgrs.textContent = String((state.managers || []).length);
  }

  if (typeof state.onlineCount === 'number') {
    updateOnlinePresenceUI(state.onlineCount);
  }

  const deptPillsWrap = document.getElementById('market-category-pills');
  if (deptPillsWrap) {
    if (user.role === 'director') {
      deptPillsWrap.style.display = '';
    } else {
      deptPillsWrap.style.display = 'none';
      deptPillsWrap.querySelectorAll('.market-pill').forEach(p => {
        const isAll = p.getAttribute('data-category') === 'all';
        p.classList.toggle('active', isAll);
        p.setAttribute('aria-pressed', isAll ? 'true' : 'false');
      });
    }
  }

  if (adminPendingBadge) {
    if (user.role === 'director' && pendingApprovals.length > 0) {
      adminPendingBadge.textContent = String(pendingApprovals.length);
      adminPendingBadge.style.display = 'inline-block';
    } else {
      adminPendingBadge.style.display = 'none';
    }
  }

  // Projects list (strictly RBAC-filtered by server)
  const incomingProjects = Array.isArray(state.projects) ? state.projects : [];
  const nextProjectsSig = JSON.stringify(incomingProjects.map(p => ({
    id: p.id,
    bidCount: p.bidCount,
    currentBidXMR: p.currentBidXMR,
    name: p.name,
    department: p.department,
    assigneeId: p.assigneeId || '',
    taskStatus: p.taskStatus || 'todo',
    dueDate: p.dueDate || ''
  })));
  if (nextProjectsSig !== lastProjectsSig) {
    lastProjectsSig = nextProjectsSig;
    MARKET_PRODUCTS = incomingProjects;
    myVendorListings = incomingProjects.filter(p => p.createdBy === user.id || (p.isUserCreated && p.department === user.department));
    populateOrderProductSelect(MARKET_PRODUCTS);
    updateOrderPreviewCard();
    filterAndRenderProducts();
    renderMyListings();
  }

  // Rooms list (strictly RBAC-filtered by server)
  const incomingRooms = Array.isArray(state.rooms) ? state.rooms : [];
  const nextRoomsSig = JSON.stringify(incomingRooms.map(r => ({
    id: r.id,
    name: r.name,
    scope: r.scope,
    status: r.status,
    msgs: (r.messages || []).map(m => `${m.id}:${m.deleteStatus || ''}`)
  })));

  if (nextRoomsSig !== lastRoomsSig) {
    lastRoomsSig = nextRoomsSig;
    chatThreads = incomingRooms.map(r => {
      const msgs = Array.isArray(r.messages) ? r.messages : [];
      const mappedMsgs = msgs.map(m => {
        if (m.senderRole === 'system') {
          return { author: m.senderName || 'Hệ thống', role: 'system', time: m.time || '', text: m.text };
        }
        const roleTag = ROLE_LABELS_VI[m.senderRole] || '';
        const displayName = roleTag ? `${m.senderName} (${roleTag})` : m.senderName;
        return {
          id: m.id,
          senderId: m.senderId,
          senderRole: m.senderRole,
          author: displayName,
          role: m.senderId === user.id ? 'buyer' : 'merchant',
          time: m.time || '',
          text: m.text,
          mentions: m.mentions || [],
          attachment: m.attachment || null,
          deleteStatus: m.deleteStatus || null,
          deleteRequestedByName: m.deleteRequestedByName || ''
        };
      });
      const lastM = msgs[msgs.length - 1];
      const deptObj = (state.departments || []).find(d => d.id === r.department);
      const deptName = r.department === 'executive' ? 'Ban Điều Hành' : (deptObj ? deptObj.short : r.department);
      return {
        id: r.id,
        roomId: r.id,
        isCompanyRoom: true,
        scope: r.scope,
        department: r.department,
        departmentName: deptName,
        projectId: r.projectId || '',
        status: r.status,
        pendingAction: r.pendingAction || null,
        requestedByName: r.requestedByName || r.createdByName || '',
        peerAlias: r.name,
        productName: `${SCOPE_LABELS_VI[r.scope] || r.scope} · ${deptName}`,
        avatarText: (deptName || r.name || 'P').charAt(0).toUpperCase(),
        lastMessage: lastM ? lastM.text : 'Chưa có tin nhắn',
        lastTime: lastM ? lastM.time : '',
        unreadCount: 0,
        messages: mappedMsgs
      };
    });

    if (!chatThreads.some(t => t.id === activeThreadId)) {
      activeThreadId = chatThreads[0]?.id || '';
    }

    renderMessengerThreads();
    updateActiveThreadHeader();
    renderChatMessages();
  }

  if (user.role === 'manager' || user.role === 'director') {
    renderTeamTab(state);
  }
  if (user.role === 'director') {
    renderDirectorConsole(state);
  }
  updateRamMonitor();
}

async function sendCompanyRoomMessage(roomId, text, attachment = null) {
  try {
    const payload = { text };
    if (attachment) payload.attachment = attachment;
    const res = await bazaarApiFetch(`/api/company/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Không thể gửi tin nhắn vào phòng chat này.', 'error');
      return;
    }
    await fetchCompanyState(true);
  } catch {
    showToast('Lỗi kết nối khi gửi tin nhắn.', 'error');
  }
}

function initClosedCompanyModalsAndAdmin() {
  const closeCreateBtn = document.getElementById('close-create-room-modal-btn');
  const cancelCreateBtn = document.getElementById('cancel-create-room-btn');
  const createOverlay = document.getElementById('create-room-modal-overlay');
  const createForm = document.getElementById('create-room-form');
  const newScopeSelect = document.getElementById('new-room-scope');

  if (closeCreateBtn) closeCreateBtn.addEventListener('click', () => closeAccessibleModal(createOverlay));
  if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', () => closeAccessibleModal(createOverlay));
  if (createOverlay) {
    createOverlay.addEventListener('click', (e) => {
      if (e.target === createOverlay) closeAccessibleModal(createOverlay);
    });
  }

  if (newScopeSelect) {
    newScopeSelect.addEventListener('change', syncCreateRoomModalFields);
  }

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isCompanyAuthActive()) return;
      const user = currentCompanyState.user;
      const name = (document.getElementById('new-room-name')?.value || '').trim();
      const scope = document.getElementById('new-room-scope')?.value || 'department';
      const department = user.role === 'director'
        ? (document.getElementById('new-room-dept')?.value || 'devops')
        : user.department;
      const projectId = document.getElementById('new-room-project')?.value || '';
      const participantIds = Array.from(document.querySelectorAll('#modal-room-participants input[type="checkbox"]:checked')).map(cb => cb.value);

      const res = await bazaarApiFetch('/api/company/rooms/request-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope,
          department,
          projectId,
          participantIds,
          includeAllManagers: participantIds.length === 0 && (scope === 'manager_to_manager' || scope === 'manager_director')
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không thể tạo phòng chat.', 'error');
        return;
      }

      closeAccessibleModal(createOverlay);
      if (document.getElementById('new-room-name')) document.getElementById('new-room-name').value = '';
      if (data.status === 'pending_approval') {
        showToast('Đã gửi yêu cầu tạo phòng chat! Đang chờ Giám đốc phê duyệt.', 'info');
      } else {
        showToast(`Đã mở phòng chat "${name}" hoạt động ngay!`, 'success');
      }
      await fetchCompanyState(true);
      if (data.room && data.room.id) {
        selectMessengerThread(data.room.id);
      }
    });
  }

  // Delete request / direct delete button in active chat header
  const reqDeleteBtn = document.getElementById('room-request-delete-btn');
  if (reqDeleteBtn) {
    reqDeleteBtn.addEventListener('click', async () => {
      if (!isCompanyAuthActive()) return;
      const thread = getActiveThread();
      if (!thread) return;
      const isDir = currentCompanyState.user.role === 'director';
      const msg = isDir
        ? `Xóa vĩnh viễn phòng chat "${thread.peerAlias}"?`
        : `Gửi yêu cầu tới Giám đốc để phê duyệt xóa phòng/đoạn chat "${thread.peerAlias}"?`;
      if (!window.confirm(msg)) return;

      const res = await bazaarApiFetch(`/api/company/rooms/${encodeURIComponent(thread.id)}/request-delete`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Thao tác không được phép.', 'error');
        return;
      }
      if (data.status === 'deleted') {
        showToast('Giám đốc đã xóa vĩnh viễn phòng chat.', 'success');
      } else {
        showToast('Đã gửi yêu cầu xóa phòng chat! Đang chờ Giám đốc phê duyệt.', 'info');
      }
      await fetchCompanyState(true);
    });
  }

  // Inline Director Approve / Reject inside chat header banner
  const inlineApproveBtn = document.getElementById('room-inline-approve-btn');
  const inlineRejectBtn = document.getElementById('room-inline-reject-btn');
  if (inlineApproveBtn) {
    inlineApproveBtn.addEventListener('click', () => {
      const thread = getActiveThread();
      if (thread) decideRoomApproval(thread.id, 'approve');
    });
  }
  if (inlineRejectBtn) {
    inlineRejectBtn.addEventListener('click', () => {
      const thread = getActiveThread();
      if (thread) decideRoomApproval(thread.id, 'reject');
    });
  }

  // Tab 5 Director Admin Console bindings
  const adminRefreshBtn = document.getElementById('admin-refresh-btn');
  if (adminRefreshBtn) adminRefreshBtn.addEventListener('click', () => fetchCompanyState(false));

  const execScopeSelect = document.getElementById('exec-room-scope');
  if (execScopeSelect) {
    execScopeSelect.addEventListener('change', () => {
      const s = execScopeSelect.value;
      const deptWrap = document.getElementById('exec-room-dept-wrap');
      const partWrap = document.getElementById('exec-room-participants-wrap');
      const isExec = s === 'manager_director' || s === 'manager_to_manager';
      if (deptWrap) deptWrap.style.display = isExec ? 'none' : 'block';
      if (partWrap) partWrap.style.display = isExec ? 'block' : 'none';
    });
  }

  const execForm = document.getElementById('director-exec-room-form');
  if (execForm) {
    execForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('exec-room-name')?.value || '').trim();
      const scope = document.getElementById('exec-room-scope')?.value || 'manager_director';
      const department = document.getElementById('exec-room-dept')?.value || 'devops';
      const participantIds = Array.from(document.querySelectorAll('#exec-room-participants input[type="checkbox"]:checked')).map(cb => cb.value);

      const res = await bazaarApiFetch('/api/company/rooms/request-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope,
          department,
          participantIds,
          includeAllManagers: participantIds.length === 0 && (scope === 'manager_to_manager' || scope === 'manager_director')
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không thể khởi tạo phòng điều hành.', 'error');
        return;
      }
      if (document.getElementById('exec-room-name')) document.getElementById('exec-room-name').value = '';
      showToast(`Đã tạo phòng chat "${name}"!`, 'success');
      await fetchCompanyState(true);
      if (data.room && data.room.id) {
        switchTab('tab-chat');
        selectMessengerThread(data.room.id);
      }
    });
  }

  const addMgrForm = document.getElementById('director-add-manager-form');
  if (addMgrForm) {
    addMgrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('mgr-name')?.value || '').trim();
      const username = (document.getElementById('mgr-username')?.value || '').trim();
      const password = document.getElementById('mgr-password')?.value || '123';
      const department = document.getElementById('mgr-dept')?.value || 'devops';
      const title = (document.getElementById('mgr-title')?.value || '').trim();

      const res = await bazaarApiFetch('/api/company/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, department, title })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không thể thêm Quản lí mới.', 'error');
        return;
      }
      addMgrForm.reset();
      if (document.getElementById('mgr-password')) document.getElementById('mgr-password').value = '123';
      showToast(`Đã thêm Quản lí ${data.manager?.name || name}!`, 'success');
      await fetchCompanyState(true);
    });
  }
}

function openCreateRoomModal() {
  if (!isCompanyAuthActive()) return;
  const user = currentCompanyState.user;
  const overlay = document.getElementById('create-room-modal-overlay');
  const scopeSelect = document.getElementById('new-room-scope');
  const projSelect = document.getElementById('new-room-project');
  const partGrid = document.getElementById('modal-room-participants');
  const approvalNote = document.getElementById('create-room-approval-note');
  const submitBtn = document.getElementById('submit-create-room-btn');

  if (scopeSelect) {
    if (user.role === 'director') {
      scopeSelect.innerHTML = `
        <option value="manager_director">Quản lí ↔ Giám đốc</option>
        <option value="manager_to_manager">Quản lí ↔ Quản lí</option>
        <option value="department">Phòng chat theo Ban</option>
        <option value="work">Phòng chat Công việc</option>
      `;
    } else {
      scopeSelect.innerHTML = `
        <option value="department">Phòng chat Ban (${escapeHtml(user.departmentName)})</option>
        <option value="work">Phòng chat Công việc (theo đầu việc)</option>
      `;
    }
  }

  if (projSelect) {
    const projs = currentCompanyState.projects || [];
    projSelect.innerHTML = '<option value="">-- Không gắn dự án cụ thể --</option>' +
      projs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  }

  if (partGrid && user.role === 'director') {
    const mgrs = currentCompanyState.managers || [];
    partGrid.innerHTML = mgrs.map(m => `
      <label class="participant-check-chip">
        <input type="checkbox" value="${escapeHtml(m.id)}">
        <span>${escapeHtml(m.name)} (${escapeHtml(m.departmentName)})</span>
      </label>
    `).join('');
  }

  if (approvalNote) {
    approvalNote.innerHTML = user.role === 'director'
      ? '<strong>Quyền Giám đốc:</strong> Phòng chat sẽ được kích hoạt hoạt động ngay sau khi tạo.'
      : 'Lưu ý: Phòng chat do <strong>Quản lí</strong> tạo sẽ vào hàng đợi <strong>Chờ Giám đốc phê duyệt</strong> trước khi Nhân viên sử dụng.';
  }
  if (submitBtn) {
    submitBtn.textContent = user.role === 'director' ? 'Mở phòng chat ngay' : 'Gửi yêu cầu tạo phòng';
  }

  syncCreateRoomModalFields();
  openAccessibleModal(overlay, '#new-room-name');
}

function syncCreateRoomModalFields() {
  if (!isCompanyAuthActive()) return;
  const user = currentCompanyState.user;
  const scope = document.getElementById('new-room-scope')?.value || 'department';
  const deptGroup = document.getElementById('new-room-dept-group');
  const projGroup = document.getElementById('new-room-project-group');
  const partGroup = document.getElementById('new-room-participants-group');

  const isExec = scope === 'manager_to_manager' || scope === 'manager_director';
  if (deptGroup) deptGroup.style.display = (user.role === 'director' && !isExec) ? 'block' : 'none';
  if (projGroup) projGroup.style.display = scope === 'work' ? 'block' : 'none';
  if (partGroup) partGroup.style.display = (user.role === 'director' && isExec) ? 'block' : 'none';
}

async function decideRoomApproval(roomId, decision) {
  const res = await bazaarApiFetch(`/api/company/approvals/${encodeURIComponent(roomId)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.error || 'Không thể xử lý phê duyệt.', 'error');
    return;
  }
  showToast(decision === 'approve' ? 'Giám đốc đã PHÊ DUYỆT yêu cầu!' : 'Giám đốc đã TỪ CHỐI yêu cầu.', decision === 'approve' ? 'success' : 'info');
  await fetchCompanyState(true);
}

function renderDirectorConsole(state) {
  const approvals = Array.isArray(state.approvals) ? state.approvals : [];
  const managers = Array.isArray(state.managers) ? state.managers : [];
  const departments = Array.isArray(state.departments) ? state.departments : [];
  const auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];

  // 1. Unified Approvals Queue (Rooms + Message Deletions)
  const appSig = JSON.stringify(approvals);
  if (appSig !== lastApprovalsSig) {
    lastApprovalsSig = appSig;
    const appBox = document.getElementById('director-approvals-list');
    if (appBox) {
      if (approvals.length === 0) {
        appBox.innerHTML = '<p class="empty-listings-note">Không có yêu cầu tạo/xóa phòng chat hoặc xóa tin nhắn nào đang chờ phê duyệt.</p>';
      } else {
        appBox.innerHTML = approvals.map(a => {
          const isMsg = a.kind === 'message';
          const isDel = a.pendingAction === 'delete' || isMsg;
          const badgeText = isMsg
            ? 'Đề xuất XÓA đoạn chat'
            : (a.pendingAction === 'delete' ? 'Đề xuất XÓA phòng chat' : 'Đề xuất TẠO phòng mới');
          const detailLine = isMsg
            ? `Tin nhắn của <strong>${escapeHtml(a.messageSenderName || '')}</strong>: "${escapeHtml(a.messagePreview || '')}" · Phòng: ${escapeHtml(a.roomName)}`
            : `Phòng: <strong>${escapeHtml(a.roomName)}</strong> (${escapeHtml(SCOPE_LABELS_VI[a.scope] || a.scope)})`;

          return `
            <div class="approval-card ${isDel ? 'is-delete' : 'is-create'}">
              <div class="approval-card-body">
                <div class="approval-badges">
                  <span class="approval-type-pill ${isDel ? 'delete' : 'create'}">${badgeText}</span>
                  <span class="approval-dept-pill">${escapeHtml(a.departmentName)}</span>
                </div>
                <div class="approval-room-name">${detailLine}</div>
                <div class="approval-meta">Quản lí đề xuất: <strong>${escapeHtml(a.requestedByName)}</strong></div>
              </div>
              <div class="approval-actions">
                <button type="button" class="primary-btn approval-decide-btn" data-kind="${escapeHtml(a.kind || 'room')}" data-room-id="${escapeHtml(a.roomId)}" data-msg-id="${escapeHtml(a.msgId || '')}" data-decision="approve">Phê duyệt</button>
                <button type="button" class="secondary-btn approval-decide-btn" data-kind="${escapeHtml(a.kind || 'room')}" data-room-id="${escapeHtml(a.roomId)}" data-msg-id="${escapeHtml(a.msgId || '')}" data-decision="reject">Từ chối</button>
              </div>
            </div>
          `;
        }).join('');

        appBox.querySelectorAll('.approval-decide-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const kind = btn.getAttribute('data-kind');
            const rId = btn.getAttribute('data-room-id');
            const mId = btn.getAttribute('data-msg-id');
            const dec = btn.getAttribute('data-decision');
            if (kind === 'message' && mId) {
              decideMessageApproval(rId, mId, dec);
            } else {
              decideRoomApproval(rId, dec);
            }
          });
        });
      }
    }
  }

  // 2. Managers coordination list + Participant checkboxes
  const mgrSig = JSON.stringify(managers);
  if (mgrSig !== lastManagersSig) {
    lastManagersSig = mgrSig;
    const partWrap = document.getElementById('exec-room-participants');
    if (partWrap) {
      partWrap.innerHTML = managers.map(m => `
        <label class="participant-check-chip">
          <input type="checkbox" value="${escapeHtml(m.id)}">
          <span>${escapeHtml(m.name)} (${escapeHtml(m.departmentName)})</span>
        </label>
      `).join('');
    }

    const mgrListBox = document.getElementById('director-managers-list');
    if (mgrListBox) {
      mgrListBox.innerHTML = managers.map(m => `
        <div class="manager-row-card">
          <div class="manager-info-col">
            <div class="manager-name-line">
              <strong>${escapeHtml(m.name)}</strong>
              <code>@${escapeHtml(m.username)}</code>
            </div>
            <div class="manager-sub-line">${escapeHtml(m.title)} · Hiện tại: <strong>${escapeHtml(m.departmentName)}</strong></div>
          </div>
          <div class="manager-coord-col">
            <label class="sr-only" for="coord-dept-${escapeHtml(m.id)}">Điều phối ban cho ${escapeHtml(m.name)}</label>
            <select id="coord-dept-${escapeHtml(m.id)}" class="custom-select mini-select mgr-coord-select" data-user-id="${escapeHtml(m.id)}">
              ${departments.map(d => `<option value="${escapeHtml(d.id)}" ${d.id === m.department ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
            </select>
            <button type="button" class="secondary-btn mgr-coord-btn" data-user-id="${escapeHtml(m.id)}">Điều phối Ban</button>
            <button type="button" class="secondary-btn mgr-toggle-lock-btn" data-user-id="${escapeHtml(m.id)}" data-active="${m.active !== false ? 'true' : 'false'}">${m.active !== false ? 'Khóa' : 'Mở khóa'}</button>
          </div>
        </div>
      `).join('');

      mgrListBox.querySelectorAll('.mgr-toggle-lock-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.getAttribute('data-user-id');
          const curActive = btn.getAttribute('data-active') === 'true';
          const res = await bazaarApiFetch(`/api/company/managers/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: !curActive })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(data.error || 'Không thể cập nhật trạng thái Quản lí.', 'error');
            return;
          }
          showToast(curActive ? 'Đã khóa tài khoản Quản lí!' : 'Đã mở khóa tài khoản Quản lí!', 'info');
          await fetchCompanyState(true);
        });
      });

      mgrListBox.querySelectorAll('.mgr-coord-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.getAttribute('data-user-id');
          const selectEl = document.getElementById(`coord-dept-${userId}`);
          const newDept = selectEl?.value;
          if (!userId || !newDept) return;
          const res = await bazaarApiFetch(`/api/company/managers/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department: newDept })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(data.error || 'Không thể điều phối Quản lí.', 'error');
            return;
          }
          showToast(`Đã điều phối ${data.manager?.name || ''} sang ${data.manager?.departmentName || newDept}!`, 'success');
          await fetchCompanyState(true);
        });
      });
    }
  }

  // 3. Audit Log
  const auditSig = JSON.stringify(auditLog.map(a => a.id));
  if (auditSig !== lastAuditSig) {
    lastAuditSig = auditSig;
    const auditBox = document.getElementById('director-audit-log');
    if (auditBox) {
      auditBox.innerHTML = auditLog.map(entry => `
        <div class="audit-entry-row">
          <span class="audit-time">${escapeHtml(entry.time)}</span>
          <div class="audit-content">
            <strong>${escapeHtml(entry.actorName)}</strong>
            <span class="audit-action-badge">${escapeHtml(entry.action)}</span>
            <span class="audit-detail">${escapeHtml(entry.detail)}</span>
          </div>
        </div>
      `).join('');
    }
  }
}


/* ==========================================================================
   11. ENTERPRISE v7.5 MODULES (PASSWORD • HR EMPLOYEES • TASKS • MENTIONS • MSG DELETE)
   ========================================================================== */

function clearPendingAttachment() {
  pendingAttachmentPayload = null;
  const chip = document.getElementById('pending-attachment-chip');
  const fileInput = document.getElementById('chat-file-input');
  if (chip) chip.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

function formatMessageWithMentions(rawText) {
  const escaped = escapeHtml(rawText || '');
  return escaped.replace(/@([a-zA-Z0-9._-]+)/g, '<span class="mention-tag">@$1</span>');
}

function handleMentionAutocompleteInput() {
  const input = document.getElementById('chat-input-field');
  if (!input || !isCompanyAuthActive()) {
    hideMentionPopup();
    return;
  }
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
  if (!match) {
    hideMentionPopup();
    return;
  }
  const kw = match[1].toLowerCase();
  const candidates = Array.isArray(currentCompanyState.mentionCandidates) ? currentCompanyState.mentionCandidates : [];
  mentionSuggestions = candidates
    .filter(c => c.username.toLowerCase().includes(kw) || c.name.toLowerCase().includes(kw))
    .slice(0, 6);

  if (mentionSuggestions.length === 0) {
    hideMentionPopup();
    return;
  }
  mentionActiveIndex = 0;
  renderMentionPopup();
}

function renderMentionPopup() {
  const popup = document.getElementById('mention-autocomplete-list');
  if (!popup) return;
  popup.innerHTML = mentionSuggestions.map((u, idx) => `
    <button type="button" class="mention-option-btn ${idx === mentionActiveIndex ? 'active' : ''}" role="option" aria-selected="${idx === mentionActiveIndex ? 'true' : 'false'}" data-username="${escapeHtml(u.username)}">
      <strong>@${escapeHtml(u.username)}</strong>
      <span>${escapeHtml(u.name)} · ${escapeHtml(u.departmentName)}</span>
    </button>
  `).join('');
  popup.style.display = 'flex';
  popup.querySelectorAll('.mention-option-btn').forEach((btn, idx) => {
    btn.addEventListener('click', () => applyMentionSuggestion(mentionSuggestions[idx]));
  });
}

function applyMentionSuggestion(userObj) {
  const input = document.getElementById('chat-input-field');
  if (!input || !userObj) return;
  const cursor = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, cursor);
  const after = input.value.slice(cursor);
  const replaced = before.replace(/@([a-zA-Z0-9._-]*)$/, `@${userObj.username} `);
  input.value = replaced + after;
  input.focus();
  input.setSelectionRange(replaced.length, replaced.length);
  hideMentionPopup();
}

function hideMentionPopup() {
  const popup = document.getElementById('mention-autocomplete-list');
  if (popup) popup.style.display = 'none';
  mentionSuggestions = [];
  mentionActiveIndex = 0;
}

async function requestDeleteCompanyMessage(roomId, msgId) {
  if (!isCompanyAuthActive()) return;
  const isDir = currentCompanyState.user.role === 'director';
  const promptText = isDir
    ? 'Xóa vĩnh viễn tin nhắn/đoạn chat này?'
    : 'Gửi yêu cầu tới Giám đốc để phê duyệt xóa tin nhắn/đoạn chat này?';
  if (!window.confirm(promptText)) return;

  const res = await bazaarApiFetch(`/api/company/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(msgId)}/request-delete`, {
    method: 'POST'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.error || 'Không thể gửi yêu cầu xóa tin nhắn.', 'error');
    return;
  }
  showToast(data.status === 'deleted' ? 'Giám đốc đã xóa vĩnh viễn tin nhắn.' : 'Đã gửi yêu cầu xóa tin nhắn! Chờ Giám đốc phê duyệt.', 'info');
  await fetchCompanyState(true);
}

async function decideMessageApproval(roomId, msgId, decision) {
  const res = await bazaarApiFetch(`/api/company/approvals/messages/${encodeURIComponent(roomId)}/${encodeURIComponent(msgId)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.error || 'Không thể xử lý phê duyệt xóa tin nhắn.', 'error');
    return;
  }
  showToast(decision === 'approve' ? 'Giám đốc đã PHÊ DUYỆT xóa tin nhắn!' : 'Giám đốc đã giữ lại tin nhắn.', decision === 'approve' ? 'success' : 'info');
  await fetchCompanyState(true);
}

function renderTeamTab(state) {
  const user = state.user;
  const empDeptSelect = document.getElementById('emp-dept');
  const empDeptSub = document.getElementById('team-add-emp-desc');
  if (empDeptSelect) {
    if (user.role === 'manager') {
      empDeptSelect.value = user.department;
      empDeptSelect.disabled = true;
      if (empDeptSub) empDeptSub.textContent = `Nhân viên mới sẽ thuộc ${user.departmentName} do bạn quản lí.`;
    } else {
      empDeptSelect.disabled = false;
      if (empDeptSub) empDeptSub.textContent = 'Giám đốc có thể thêm và điều chuyển Nhân viên cho bất kỳ phòng ban nào.';
    }
  }

  const listData = user.role === 'director'
    ? (Array.isArray(state.employees) ? state.employees : [])
    : (Array.isArray(state.departmentEmployees) ? state.departmentEmployees : []);
  const sig = JSON.stringify(listData) + '|' + user.role;
  if (sig === lastTeamSig) return;
  lastTeamSig = sig;

  const box = document.getElementById('team-employees-list');
  if (!box) return;

  if (listData.length === 0) {
    box.innerHTML = '<p class="empty-listings-note">Chưa có tài khoản Nhân viên nào trong phạm vi hiển thị.</p>';
    return;
  }

  const departments = Array.isArray(state.departments) ? state.departments : [];
  box.innerHTML = listData.map(emp => `
    <div class="manager-row-card ${emp.active === false ? 'is-locked-row' : ''}">
      <div class="manager-info-col">
        <div class="manager-name-line">
          <strong>${escapeHtml(emp.name)}</strong>
          <code>@${escapeHtml(emp.username)}</code>
          <span class="emp-status-pill ${emp.active === false ? 'locked' : 'active'}">${emp.active === false ? 'Đã khóa' : 'Hoạt động'}</span>
        </div>
        <div class="manager-sub-line">${escapeHtml(emp.title)} · ${escapeHtml(emp.departmentName)}</div>
      </div>
      <div class="manager-coord-col">
        ${user.role === 'director' ? `
          <label class="sr-only" for="emp-move-dept-${escapeHtml(emp.id)}">Chuyển ban cho ${escapeHtml(emp.name)}</label>
          <select id="emp-move-dept-${escapeHtml(emp.id)}" class="custom-select mini-select emp-dept-select" data-user-id="${escapeHtml(emp.id)}">
            ${departments.map(d => `<option value="${escapeHtml(d.id)}" ${d.id === emp.department ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
          <button type="button" class="secondary-btn emp-move-btn" data-user-id="${escapeHtml(emp.id)}">Chuyển Ban</button>
        ` : ''}
        <button type="button" class="secondary-btn emp-toggle-lock-btn" data-user-id="${escapeHtml(emp.id)}" data-active="${emp.active !== false ? 'true' : 'false'}">${emp.active !== false ? 'Khóa TK' : 'Mở khóa'}</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.emp-move-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-user-id');
      const newDept = document.getElementById(`emp-move-dept-${uid}`)?.value;
      if (!uid || !newDept) return;
      const res = await bazaarApiFetch(`/api/company/employees/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: newDept })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'Lỗi chuyển ban.', 'error'); return; }
      showToast(`Đã chuyển ${data.employee?.name || ''} sang ban mới!`, 'success');
      await fetchCompanyState(true);
    });
  });

  box.querySelectorAll('.emp-toggle-lock-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-user-id');
      const curActive = btn.getAttribute('data-active') === 'true';
      const res = await bazaarApiFetch(`/api/company/employees/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !curActive })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'Không thể khóa/mở khóa tài khoản.', 'error'); return; }
      showToast(curActive ? 'Đã khóa tài khoản Nhân viên (thu hồi phiên lập tức)!' : 'Đã mở khóa tài khoản Nhân viên!', 'info');
      await fetchCompanyState(true);
    });
  });
}

function openAssignTaskModal(projectId) {
  if (!isCompanyAuthActive()) return;
  const proj = MARKET_PRODUCTS.find(p => p.id === projectId);
  if (!proj) return;
  const user = currentCompanyState.user;
  const overlay = document.getElementById('assign-task-modal-overlay');
  const idInput = document.getElementById('assign-project-id');
  const titleBox = document.getElementById('assign-project-title-preview');
  const userSelect = document.getElementById('assign-user-select');
  const statusSelect = document.getElementById('assign-status-select');
  const dueInput = document.getElementById('assign-due-input');

  if (idInput) idInput.value = proj.id;
  if (titleBox) titleBox.textContent = proj.name;
  if (statusSelect) statusSelect.value = proj.taskStatus || 'todo';
  if (dueInput) {
    dueInput.value = proj.dueDate || '';
    dueInput.disabled = user.role === 'employee';
  }

  if (userSelect) {
    const pool = user.role === 'director'
      ? [...(currentCompanyState.employees || []), ...(currentCompanyState.managers || [])].filter(u => u.department === proj.department && u.active !== false)
      : [...(currentCompanyState.departmentEmployees || [])].filter(u => u.active !== false);
    userSelect.innerHTML = '<option value="">-- Chưa phân công --</option>' +
      pool.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} (${ROLE_LABELS_VI[u.role] || u.role})</option>`).join('');
    userSelect.value = proj.assigneeId || '';
    userSelect.disabled = user.role === 'employee';
  }

  openAccessibleModal(overlay, user.role === 'employee' ? '#assign-status-select' : '#assign-user-select');
}

function bindV75ModalAndTeamForms() {
  // Change Password Modal
  const openPwdBtn = document.getElementById('open-change-pwd-btn');
  const closePwdBtn = document.getElementById('close-change-pwd-btn');
  const cancelPwdBtn = document.getElementById('cancel-change-pwd-btn');
  const pwdOverlay = document.getElementById('change-pwd-modal-overlay');
  const pwdForm = document.getElementById('change-pwd-form');

  if (openPwdBtn && pwdOverlay) {
    openPwdBtn.addEventListener('click', () => openAccessibleModal(pwdOverlay, '#cur-pwd-input'));
  }
  if (closePwdBtn) closePwdBtn.addEventListener('click', () => closeAccessibleModal(pwdOverlay));
  if (cancelPwdBtn) cancelPwdBtn.addEventListener('click', () => closeAccessibleModal(pwdOverlay));
  if (pwdOverlay) {
    pwdOverlay.addEventListener('click', (e) => {
      if (e.target === pwdOverlay) closeAccessibleModal(pwdOverlay);
    });
  }
  if (pwdForm) {
    pwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const curPwd = document.getElementById('cur-pwd-input')?.value || '';
      const newPwd = document.getElementById('new-pwd-input')?.value || '';
      const confirmPwd = document.getElementById('confirm-pwd-input')?.value || '';
      if (newPwd !== confirmPwd) {
        showToast('Mật khẩu mới và xác nhận không khớp!', 'warning');
        return;
      }
      const res = await bazaarApiFetch('/api/company/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không thể đổi mật khẩu.', 'error');
        return;
      }
      pwdForm.reset();
      closeAccessibleModal(pwdOverlay);
      showToast('Đã cập nhật và mã hóa mật khẩu mới thành công!', 'success');
    });
  }

  // Assign Task Modal
  const assignOverlay = document.getElementById('assign-task-modal-overlay');
  const closeAssignBtn = document.getElementById('close-assign-task-btn');
  const cancelAssignBtn = document.getElementById('cancel-assign-task-btn');
  const assignForm = document.getElementById('assign-task-form');
  if (closeAssignBtn) closeAssignBtn.addEventListener('click', () => closeAccessibleModal(assignOverlay));
  if (cancelAssignBtn) cancelAssignBtn.addEventListener('click', () => closeAccessibleModal(assignOverlay));
  if (assignOverlay) {
    assignOverlay.addEventListener('click', (e) => {
      if (e.target === assignOverlay) closeAccessibleModal(assignOverlay);
    });
  }
  if (assignForm) {
    assignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isCompanyAuthActive()) return;
      const projectId = document.getElementById('assign-project-id')?.value || '';
      const taskStatus = document.getElementById('assign-status-select')?.value || 'todo';
      const payload = { taskStatus };
      if (currentCompanyState.user.role !== 'employee') {
        payload.assigneeId = document.getElementById('assign-user-select')?.value || '';
        payload.dueDate = document.getElementById('assign-due-input')?.value || '';
      }
      const res = await bazaarApiFetch(`/api/company/projects/${encodeURIComponent(projectId)}/task`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không thể lưu phân công công việc.', 'error');
        return;
      }
      closeAccessibleModal(assignOverlay);
      showToast('Đã cập nhật phân công & tiến độ công việc!', 'success');
      await fetchCompanyState(true);
    });
  }

  // Add Employee Form in #tab-team
  const addEmpForm = document.getElementById('team-add-employee-form');
  if (addEmpForm) {
    addEmpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isCompanyAuthActive()) return;
      const user = currentCompanyState.user;
      const name = (document.getElementById('emp-name')?.value || '').trim();
      const username = (document.getElementById('emp-username')?.value || '').trim();
      const password = document.getElementById('emp-password')?.value || '123';
      const title = (document.getElementById('emp-title')?.value || '').trim();
      const department = user.role === 'director'
        ? (document.getElementById('emp-dept')?.value || 'devops')
        : user.department;

      const res = await bazaarApiFetch('/api/company/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, department, title })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Không thể thêm Nhân viên.', 'error');
        return;
      }
      addEmpForm.reset();
      if (document.getElementById('emp-password')) document.getElementById('emp-password').value = '123';
      showToast(`Đã thêm Nhân viên ${data.employee?.name || name}!`, 'success');
      loadQuickLoginDirectory();
      await fetchCompanyState(true);
    });
  }
}


/* ==========================================================================
   12. v8.0 REALTIME RFC 6455 WEBSOCKET CLIENT & SECURE BLOB ATTACHMENTS
   ========================================================================== */

let companyWs = null;
let companyWsReconnectTimer = null;
let companyWsBackoffMs = 1000;
let companyWsSyncDebounce = null;
const attachmentBlobCache = new Map();

function updateOnlinePresenceUI(count) {
  const el = document.getElementById('ws-online-count');
  if (!el) return;
  const safeCount = Math.max(0, Number(count) || 0);
  el.textContent = `${safeCount} trực tuyến`;
}

function updateTransportStatusUI(mode) {
  const label = document.getElementById('ws-transport-label');
  const dot = document.getElementById('ws-transport-dot');
  if (label) {
    label.textContent = mode === 'ws' ? 'WS Realtime' : (mode === 'connecting' ? 'WS Kết nối...' : 'HTTP Sync');
  }
  if (dot) {
    dot.classList.toggle('is-fallback', mode !== 'ws');
  }
}

function startSlowFallbackPolling() {
  if (companyPollTimer) return;
  companyPollTimer = setInterval(() => {
    if (companyAuthToken) {
      fetchCompanyState(true);
    }
  }, 10000);
}

function stopFallbackPolling() {
  if (companyPollTimer) {
    clearInterval(companyPollTimer);
    companyPollTimer = null;
  }
}

function disconnectCompanyWebSocket() {
  if (companyWsReconnectTimer) {
    clearTimeout(companyWsReconnectTimer);
    companyWsReconnectTimer = null;
  }
  if (companyWsSyncDebounce) {
    clearTimeout(companyWsSyncDebounce);
    companyWsSyncDebounce = null;
  }
  stopFallbackPolling();
  if (companyWs) {
    try {
      companyWs.onclose = null;
      companyWs.onerror = null;
      companyWs.onmessage = null;
      companyWs.close(1000, 'Logout');
    } catch {}
    companyWs = null;
  }
}

function connectCompanyWebSocket() {
  if (!companyAuthToken || typeof WebSocket === 'undefined') {
    updateTransportStatusUI('http');
    startSlowFallbackPolling();
    return;
  }

  disconnectCompanyWebSocket();
  updateTransportStatusUI('connecting');

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.port === '3000' || !window.location.port
    ? window.location.host
    : '127.0.0.1:3000';
  const wsUrl = `${proto}//${host}/ws/company`;

  let ws;
  try {
    ws = new WebSocket(wsUrl);
  } catch {
    updateTransportStatusUI('http');
    startSlowFallbackPolling();
    return;
  }
  companyWs = ws;

  ws.onopen = () => {
    if (companyAuthToken && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'auth', token: companyAuthToken }));
    }
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.type === 'auth_ok') {
      companyWsBackoffMs = 1000;
      stopFallbackPolling();
      updateTransportStatusUI('ws');
      if (typeof msg.onlineCount === 'number') {
        updateOnlinePresenceUI(msg.onlineCount);
      }
      return;
    }

    if (msg.type === 'presence') {
      if (typeof msg.onlineCount === 'number') {
        updateOnlinePresenceUI(msg.onlineCount);
      }
      return;
    }

    if (msg.type === 'sync') {
      if (companyWsSyncDebounce) clearTimeout(companyWsSyncDebounce);
      companyWsSyncDebounce = setTimeout(() => {
        if (companyAuthToken) fetchCompanyState(true);
      }, 120);
      return;
    }

    if (msg.type === 'session_revoked' || msg.type === 'auth_error') {
      const reason = msg.reason || msg.error || 'Phiên đăng nhập đã bị thu hồi hoặc hết hạn.';
      disconnectCompanyWebSocket();
      companyAuthToken = null;
      try { sessionStorage.removeItem(COMPANY_TOKEN_KEY); } catch {}
      showAuthGate(reason);
      showToast(reason, 'error');
    }
  };

  ws.onerror = () => {
    updateTransportStatusUI('http');
  };

  ws.onclose = () => {
    if (companyWs === ws) companyWs = null;
    if (!companyAuthToken) return;
    updateTransportStatusUI('http');
    startSlowFallbackPolling();

    const delay = companyWsBackoffMs;
    companyWsBackoffMs = Math.min(5000, companyWsBackoffMs * 2);
    companyWsReconnectTimer = setTimeout(() => {
      if (companyAuthToken) connectCompanyWebSocket();
    }, delay);
  };
}

function revokeAllAttachmentBlobs() {
  for (const url of attachmentBlobCache.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  attachmentBlobCache.clear();
}

async function fetchAttachmentBlobUrl(roomId, attId) {
  const cacheKey = `${roomId}:${attId}`;
  if (attachmentBlobCache.has(cacheKey)) {
    return attachmentBlobCache.get(cacheKey);
  }
  const res = await bazaarApiFetch(`/api/company/rooms/${encodeURIComponent(roomId)}/attachments/${encodeURIComponent(attId)}`, {
    method: 'GET'
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  attachmentBlobCache.set(cacheKey, objUrl);
  return objUrl;
}

function hydrateSecureAttachments(container) {
  if (!container || !companyAuthToken) return;
  container.querySelectorAll('.msg-attachment-box[data-att-id]').forEach(box => {
    const roomId = box.getAttribute('data-att-room');
    const attId = box.getAttribute('data-att-id');
    const attName = box.getAttribute('data-att-name') || 'file.bin';
    const imgEl = box.querySelector('.msg-att-lazy-img');
    const dlBtn = box.querySelector('.msg-att-dl-btn');

    if (imgEl && roomId && attId) {
      fetchAttachmentBlobUrl(roomId, attId)
        .then(blobUrl => {
          imgEl.src = blobUrl;
          imgEl.style.display = 'block';
        })
        .catch(() => {});
    }

    if (dlBtn && roomId && attId) {
      dlBtn.addEventListener('click', async () => {
        dlBtn.disabled = true;
        try {
          const blobUrl = await fetchAttachmentBlobUrl(roomId, attId);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = attName;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch {
          showToast('Không thể tải tệp đính kèm (kiểm tra quyền phòng ban).', 'error');
        } finally {
          dlBtn.disabled = false;
        }
      });
    }
  });
}
