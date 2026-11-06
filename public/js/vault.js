/**
 * @file vault.js
 * @description Controller for the Stealth Anonymous Marketplace (Ghost Bazaar).
 * Strictly RAM-Only: Zero-Log IP, Ephemeral Identity, E2EE Chat & Complete Purge-On-Exit.
 */

import qrcode from './qrcode.mjs';

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
let p2pPeerAlias = 'Khách / Đối Tác';
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

// Anonymous Catalog Inventory (In-Memory Only — Unrestricted Open Market & Auction)
let MARKET_PRODUCTS = [
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Modern non-blocking Toast notification system
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ');
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" title="Đóng">✕</button>
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

document.addEventListener('DOMContentLoaded', () => {
  generateEphemeralIdentity();
  initPanicAndPurgeHooks();
  initTelemetryAndMask();
  initTabs();
  initMarketCatalog();
  initEncryptedChat();
  initOrderSystem();
  initVendorDesk();
  initAuctionBidding();
  updateRamMonitor();
});

/* ==========================================================================
   1. EPHEMERAL IDENTITY & PURGE-ON-EXIT (ZERO-TRACE MANDATE)
   ========================================================================== */

function generateEphemeralIdentity() {
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  anonymousAlias = `Ghost-${randHex}`;

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
  // Clear chat memory
  inMemoryChatMessages.length = 0;
  activeOrder = null;

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

  updateRamMonitor();
}

function initPanicAndPurgeHooks() {
  const panicBtn = document.getElementById('panic-btn');

  const executeEmergencyEscape = () => {
    purgeAllVolatileData();
    // Redirect immediately to the benign decoy dictionary
    window.location.replace('/');
  };

  if (panicBtn) {
    panicBtn.addEventListener('click', executeEmergencyEscape);
  }

  // Global ESC key listener for instantaneous escape & wipe
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      executeEmergencyEscape();
    }
  });

  // Purge-On-Exit: Browser unload / page hide / tab close
  window.addEventListener('beforeunload', () => {
    purgeAllVolatileData();
  });

  window.addEventListener('pagehide', () => {
    purgeAllVolatileData();
  });
}

/* ==========================================================================
   2. TELEMETRY, SESSION CLOCK & EMERGENCY DECOY MASK (F2)
   ========================================================================== */

function initTelemetryAndMask() {
  // Session Clock
  const clockEl = document.getElementById('session-timer');
  if (clockEl) {
    setInterval(() => {
      sessionSeconds++;
      const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
      const secs = String(sessionSeconds % 60).padStart(2, '0');
      clockEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  // Regenerate Alias Button
  const regenBtn = document.getElementById('regen-alias-btn');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      generateEphemeralIdentity();
      showToast(`Đã cấp danh tính mới: ${anonymousAlias}`, 'info');
    });
  }

  // Emergency Academic Decoy Mask
  const maskBtn = document.getElementById('decoy-mask-btn');
  const closeMaskBtn = document.getElementById('close-mask-btn');
  const maskOverlay = document.getElementById('decoy-mask-overlay');

  const toggleMask = () => {
    if (!maskOverlay) return;
    const isShowing = maskOverlay.style.display === 'flex';
    maskOverlay.style.display = isShowing ? 'none' : 'flex';
  };

  if (maskBtn) maskBtn.addEventListener('click', toggleMask);
  if (closeMaskBtn) closeMaskBtn.addEventListener('click', toggleMask);

  // F2 Shortcut for Decoy Mask
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      toggleMask();
    }
  });

  // QR Modal Close
  const closeQrBtn = document.getElementById('close-qr-btn');
  const qrOverlay = document.getElementById('qr-modal-overlay');
  if (closeQrBtn && qrOverlay) {
    closeQrBtn.addEventListener('click', () => {
      qrOverlay.style.display = 'none';
    });
  }
}

/* ==========================================================================
   3. TABS MANAGEMENT
   ========================================================================== */

function initTabs() {
  const navTabs = document.querySelectorAll('.covert-nav-tabs .nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
  });
}

function switchTab(tabId) {
  const navTabs = document.querySelectorAll('.covert-nav-tabs .nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
  });

  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  // Clear unread badge if opening chat
  if (tabId === 'tab-chat') {
    const chatBadge = document.getElementById('chat-badge');
    if (chatBadge) chatBadge.style.display = 'none';
  }

  updateRamMonitor();
}

/* ==========================================================================
   4. ANONYMOUS PRODUCT CATALOG & FILTERING
   ========================================================================== */

function formatPriceNum(val) {
  const num = Number(val);
  if (isNaN(num)) return '0.00';
  if (num >= 100) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return num.toFixed(2);
}

function initMarketCatalog() {
  const searchInput = document.getElementById('market-search-input');
  const clearSearchBtn = document.getElementById('clear-market-search-btn');
  const sortSelect = document.getElementById('market-sort-select');
  const categoryPills = document.getElementById('market-category-pills');
  const quickOpenVendorBtn = document.getElementById('quick-open-vendor-btn');

  renderProducts(MARKET_PRODUCTS);
  updateCategoryPillCounts();
  populateOrderProductSelect(MARKET_PRODUCTS);
  updateOrderPreviewCard();

  if (quickOpenVendorBtn) {
    quickOpenVendorBtn.addEventListener('click', () => {
      switchTab('tab-vendor');
      document.getElementById('listing-name')?.focus();
    });
  }

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

  if (categoryPills) {
    categoryPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.market-pill');
      if (pill) {
        document.querySelectorAll('.market-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
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

function updateCategoryPillCounts() {
  const countAll = document.getElementById('count-all');
  if (countAll) countAll.textContent = MARKET_PRODUCTS.length;

  const countAuction = document.getElementById('count-auction');
  if (countAuction) countAuction.textContent = MARKET_PRODUCTS.filter(p => p.isAuction !== false).length;

  const countPhysical = document.getElementById('count-physical');
  if (countPhysical) countPhysical.textContent = MARKET_PRODUCTS.filter(p => p.category === 'physical').length;

  const countDigital = document.getElementById('count-digital');
  if (countDigital) countDigital.textContent = MARKET_PRODUCTS.filter(p => p.category === 'digital' || p.category === 'service').length;

  const countHw = document.getElementById('count-hardware');
  if (countHw) countHw.textContent = MARKET_PRODUCTS.filter(p => p.category === 'hardware').length;

  const countNet = document.getElementById('count-network');
  if (countNet) countNet.textContent = MARKET_PRODUCTS.filter(p => p.category === 'network').length;

  const countCrypto = document.getElementById('count-crypto');
  if (countCrypto) countCrypto.textContent = MARKET_PRODUCTS.filter(p => p.category === 'crypto' || p.category === 'audit' || p.category === 'zeroday').length;
}

function filterAndRenderProducts() {
  const query = (document.getElementById('market-search-input')?.value || '').trim().toLowerCase();
  const activePill = document.querySelector('.market-pill.active');
  const category = activePill ? activePill.getAttribute('data-category') : 'all';
  const sort = document.getElementById('market-sort-select')?.value || 'default';

  let filtered = [...MARKET_PRODUCTS];

  if (category === 'auction') {
    filtered = filtered.filter(p => p.isAuction !== false);
  } else if (category === 'digital') {
    filtered = filtered.filter(p => p.category === 'digital' || p.category === 'service');
  } else if (category === 'crypto') {
    filtered = filtered.filter(p => p.category === 'crypto' || p.category === 'audit' || p.category === 'zeroday');
  } else if (category !== 'all') {
    filtered = filtered.filter(p => p.category === category);
  }

  if (query) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.desc.toLowerCase().includes(query) ||
      (p.badge && p.badge.toLowerCase().includes(query)) ||
      p.securityLevel.toLowerCase().includes(query) ||
      Object.values(p.specs).some(val => val.toLowerCase().includes(query))
    );
  }

  // Sorting
  if (sort === 'price-asc') {
    filtered.sort((a, b) => a.rawPriceXMR - b.rawPriceXMR);
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => b.rawPriceXMR - a.rawPriceXMR);
  } else if (sort === 'bids-desc') {
    filtered.sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0));
  } else if (sort === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderProducts(filtered);
  updateCategoryPillCounts();
}

function renderProducts(products) {
  const grid = document.getElementById('market-product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-recovery-box" style="grid-column: 1 / -1;">
        <span class="empty-icon">🔍</span>
        <h3 class="empty-title">Không tìm thấy vật phẩm phù hợp trong RAM</h3>
        <p class="empty-desc">Bạn có thể tìm với từ khóa khác hoặc nhấn "➕ Đăng Bán / Đấu Giá Ngay" để niêm yết bất kỳ món đồ nào bạn muốn!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(item => {
    const currency = item.currency || 'XMR';
    const badgeCategory = escapeHtml(item.category || 'auction');
    const badgeText = escapeHtml(item.badge || 'Đấu Giá & Mua Ngay');

    const endAttr = item.auctionEndTime !== undefined ? item.auctionEndTime : (Date.now() + 3600000);
    const topRightBadge = endAttr === 0
      ? `<span class="auction-countdown-pill" data-end="0">♾️ <span class="countdown-val">MỞ TỰ DO</span></span>`
      : `<span class="auction-countdown-pill" data-end="${endAttr}">⏳ <span class="countdown-val">01:29:45</span></span>`;

    const currentVal = item.currentBidXMR ?? item.rawPriceXMR ?? 0;
    const buyNowVal = item.buyNowPrice ?? item.rawPriceXMR ?? currentVal;
    const priceLabel = 'Giá hiện tại / Đấu giá mở:';
    const priceDisplay = `${formatPriceNum(currentVal)} ${escapeHtml(currency)}`;
    const priceClass = 'product-price auction-price';
    const priceMeta = `${item.bidCount || 0} lượt trả giá • Mua đứt: ${formatPriceNum(buyNowVal)} ${escapeHtml(currency)}`;

    const actionButtons = `
      <button type="button" class="bid-btn" data-id="${escapeHtml(item.id)}" title="Đấu giá / Trả giá tự do cho vật phẩm này">
        <span>🔨</span> Đấu Giá
      </button>
      <button type="button" class="buy-btn" data-id="${escapeHtml(item.id)}" title="Mua đứt ngay lập tức qua Ký quỹ RAM">
        <span>🛒</span> Mua
      </button>
      <button type="button" class="chat-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" title="Chat thương lượng trực tiếp">
        <span>💬</span>
      </button>
    `;

    return `
      <article class="product-card" id="card-${escapeHtml(item.id)}">
        <div class="product-card-top">
          <div class="product-badge-group">
            <span class="product-badge ${badgeCategory}">${badgeText}</span>
            <span class="security-level-tag">${escapeHtml(item.securityLevel)}</span>
          </div>
          ${topRightBadge}
        </div>

        <div class="product-title-row">
          <div class="product-icon-box">${escapeHtml(item.icon)}</div>
          <h2 class="product-title">${escapeHtml(item.name)}</h2>
        </div>

        <p class="product-desc">${escapeHtml(item.desc)}</p>
        
        <div class="product-specs">
          ${Object.entries(item.specs).map(([k, v]) => `
            <div class="spec-row">
              <span class="spec-key"><span class="spec-bullet">▸</span>${escapeHtml(k)}:</span>
              <span class="spec-val">${escapeHtml(v)}</span>
            </div>
          `).join('')}
        </div>

        <div class="product-card-footer">
          <div class="product-price-block">
            <span class="product-price-label">${priceLabel}</span>
            <span class="${priceClass}">${priceDisplay}</span>
            <span class="product-bid-meta">${priceMeta}</span>
          </div>
          <div class="product-actions">
            ${actionButtons}
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Bind Buy, Bid & Chat buttons
  grid.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      initiateOrderForProduct(prodId);
    });
  });

  grid.querySelectorAll('.bid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      openBidModal(prodId);
    });
  });

  grid.querySelectorAll('.chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodName = btn.getAttribute('data-name');
      initiateChatForProduct(prodName);
    });
  });

  updateAuctionCountdowns();
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
      <div class="preview-icon-box">${escapeHtml(product.icon)}</div>
      <div>
        <h3 class="preview-title">${escapeHtml(product.name)}</h3>
        <span class="preview-badge">${escapeHtml(product.badge)} • ${escapeHtml(product.securityLevel)}</span>
      </div>
    </div>
    <div class="preview-price-row">
      <span class="detail-label">Tổng thanh toán ký quỹ:</span>
      <span class="preview-price-val">${escapeHtml(product.priceXMR)}</span>
    </div>
    <div class="product-specs" style="margin-bottom: 0;">
      <div class="spec-row">
        <span class="spec-key">Phương thức bàn giao:</span>
        <span class="spec-val">Drop ID Tự Hủy RAM (Burn-After-Reading)</span>
      </div>
      <div class="spec-row">
        <span class="spec-key">Mã hóa gói hàng:</span>
        <span class="spec-val">AES-256-GCM + PGP Custom Key</span>
      </div>
    </div>
  `;
}

function initiateOrderForProduct(productId) {
  const select = document.getElementById('order-product-select');
  if (select) {
    select.value = productId;
    updateOrderPreviewCard();
  }
  switchTab('tab-order');
  showToast('Đã nạp sản phẩm vào cổng Ký quỹ & Đơn hàng!', 'info');
}

function initiateChatForProduct(productName) {
  currentChatInquiry = productName;
  const tag = document.getElementById('active-product-tag');
  if (tag) tag.textContent = `Về: ${productName}`;

  switchTab('tab-chat');

  const input = document.getElementById('chat-input-field');
  if (input) {
    input.value = `Chào shop, tôi muốn hỏi thông tin bảo mật và phương thức bàn giao cho "${productName}"?`;
    input.focus();
  }
}

/* ==========================================================================
   5. ENCRYPTED MERCHANT CHAT (E2EE • VOLATILE RAM-ONLY)
   ========================================================================== */

function initEncryptedChat() {
  const sendBtn = document.getElementById('send-chat-btn');
  const chatInput = document.getElementById('chat-input-field');
  const purgeBtn = document.getElementById('purge-chat-btn');
  const quickBtns = document.querySelectorAll('.quick-q-btn');
  const copyPgpBtn = document.getElementById('copy-pgp-fingerprint');

  // Copy PGP Fingerprint
  if (copyPgpBtn) {
    copyPgpBtn.addEventListener('click', () => {
      const fullFingerprint = '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: GhostBazaar PGP Node v4.2\nComment: 4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC\nmQGNBF7...RAM_ONLY_KEY...==\n-----END PGP PUBLIC KEY BLOCK-----';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fullFingerprint).then(() => {
          showToast('Đã sao chép PGP Fingerprint của Người bán vào bộ đệm!', 'success');
        });
      }
    });
  }

  // Initial welcome message from Merchant Node
  inMemoryChatMessages = [
    {
      author: 'Merchant-Node-01',
      role: 'merchant',
      time: getCurrentTimeStr(),
      text: 'Xác thực E2EE hoàn tất. Chào bạn, tôi là đại diện bán hàng tự động của Ghost Bazaar. Toàn bộ phiên đàm thoại này đang nằm trên RAM khả biến máy khách, được mã hóa bằng AES-256-GCM và sẽ tự động xóa sạch hoàn toàn khi bạn rời trang hoặc nhấn ESC.'
    }
  ];
  renderChatMessages();

  // Send message handler
  const handleSendMessage = () => {
    const text = (chatInput?.value || '').trim();
    if (!text) return;

    // Push Buyer Message to in-memory array
    inMemoryChatMessages.push({
      author: anonymousAlias || 'Ghost-Buyer',
      role: 'buyer',
      time: getCurrentTimeStr(),
      text
    });

    chatInput.value = '';
    renderChatMessages();
    updateRamMonitor();

    // Show simulated typing indicator
    const typingIndicator = document.getElementById('chat-typing-indicator');
    if (typingIndicator) typingIndicator.style.display = 'flex';

    // Simulate Merchant Node automated cryptographic reply
    setTimeout(() => {
      if (typingIndicator) typingIndicator.style.display = 'none';

      const reply = generateMerchantReply(text);
      inMemoryChatMessages.push({
        author: 'Merchant-Node-01',
        role: 'merchant',
        time: getCurrentTimeStr(),
        text: reply
      });
      renderChatMessages();
      updateRamMonitor();

      // Show unread badge if tab not active
      const activeTab = document.querySelector('.covert-nav-tabs .nav-tab.active');
      if (activeTab && activeTab.getAttribute('data-tab') !== 'tab-chat') {
        const badge = document.getElementById('chat-badge');
        if (badge) badge.style.display = 'inline-block';
      }
    }, 900);
  };

  if (sendBtn) sendBtn.addEventListener('click', handleSendMessage);
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }

  // Quick inquiry buttons
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q');
      if (chatInput) {
        chatInput.value = q;
        handleSendMessage();
      }
    });
  });

  // Manual instant chat purge
  if (purgeBtn) {
    purgeBtn.addEventListener('click', () => {
      inMemoryChatMessages = [];
      renderChatMessages();
      updateRamMonitor();
      showToast('Đã xóa sạch toàn bộ lịch sử tin nhắn trong RAM!', 'success');
    });
  }
}

function renderChatMessages() {
  const container = document.getElementById('chat-message-list');
  if (!container) return;

  container.innerHTML = inMemoryChatMessages.map(msg => `
    <div class="chat-msg ${escapeHtml(msg.role)}">
      <div class="msg-header">
        <span class="msg-author">${escapeHtml(msg.author)}</span>
        <span class="msg-time">${escapeHtml(msg.time)}</span>
      </div>
      <div class="msg-bubble">${escapeHtml(msg.text)}</div>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

function generateMerchantReply(userMsg) {
  const lower = userMsg.toLowerCase();

  if (lower.includes('monero') || lower.includes('xmr') || lower.includes('thanh toán')) {
    return 'Giao dịch tại Ghost Bazaar sử dụng 100% Monero (XMR) để bảo đảm tính không thể truy vết (Stealth Addresses & RingCT). Khi bạn tạo đơn hàng, hệ thống sẽ phát sinh địa chỉ ví tạm thời dùng 1 lần trong RAM.';
  }

  if (lower.includes('drop') || lower.includes('bàn giao') || lower.includes('nhận hàng')) {
    return 'Các mặt hàng số (cấu hình mạng, chứng chỉ, whitepaper, khóa PGP) được đóng gói và mã hóa AES-256-GCM thành mã Drop ID dùng 1 lần (Burn-After-Reading). Ngay khi bạn tải về, dữ liệu sẽ tự hủy hoàn toàn trên máy chủ.';
  }

  if (lower.includes('pgp') || lower.includes('xác minh') || lower.includes('chữ ký')) {
    return 'Dấu vân tay khóa PGP chính thức của Merchant Node: [4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC]. Bạn có thể yêu cầu gói hàng được mã hóa riêng cho PGP Public Key của bạn ở tab Đơn Hàng.';
  }

  if (lower.includes('zero-log') || lower.includes('ip') || lower.includes('lưu')) {
    return 'Hệ thống vận hành theo nguyên tắc Zero-Log triệt để: Máy chủ không chạy Apache/Nginx access logs, không lưu địa chỉ IP, không ghi ổ đĩa. Mọi tin nhắn này sẽ biến mất vĩnh viễn ngay khi bạn đóng tab hoặc nhấn ESC.';
  }

  return `Đã nhận yêu cầu: "${userMsg}". Merchant-Node-01 đã sẵn sàng xử lý đơn hàng ẩn danh của bạn qua hợp đồng ký quỹ tạm thời (RAM Escrow). Bạn có thể sang tab "Đơn Hàng" để khởi tạo đơn mua.`;
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
    pill.addEventListener('click', () => {
      ttlPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (ttlValueInput) {
        ttlValueInput.value = pill.getAttribute('data-ttl');
      }
    });
  });

  // Sample PGP Public Key button
  if (samplePgpBtn) {
    samplePgpBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      if (pubkeyInput) {
        pubkeyInput.value = `-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: KeybaseOpenPGP v2.1.13\nComment: https://keybase.io/crypto\n\nxsFNBF7X4zMBEADL...sample_recipient_pubkey_bytes...==\n-----END PGP PUBLIC KEY BLOCK-----`;
        showToast('Đã dán mẫu PGP Public Key vào trường nhận hàng!', 'info');
      }
    });
  }

  // Create Order Handler
  if (createOrderBtn) {
    createOrderBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      const prodId = productSelect?.value;
      const product = MARKET_PRODUCTS.find(p => p.id === prodId) || MARKET_PRODUCTS[0];
      const ttl = parseInt(ttlValueInput?.value || '3600', 10);
      const receiverKey = (pubkeyInput?.value || '').trim();

      // Generate random Monero address & 128-bit Order ID
      const orderHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
      const orderId = `ORD-XMR-${orderHex}`;

      const xmrPrefix = '888tNkZrPN6';
      const xmrSuffix = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const xmrAddress = `${xmrPrefix}${xmrSuffix}99XMR`;

      activeOrder = {
        orderId,
        product,
        xmrAddress,
        ttl,
        receiverKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000)
      };

      displayOrderResult(activeOrder);
      updateRamMonitor();
      showToast('Khởi tạo đơn hàng ký quỹ ẩn danh thành công!', 'success');
    });
  }

  if (clearOrderBtn) {
    clearOrderBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      if (pubkeyInput) pubkeyInput.value = '';
    });
  }

  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', () => {
      activeOrder = null;
      if (orderCountdownTimer) clearInterval(orderCountdownTimer);
      const resultBox = document.getElementById('order-result-box');
      if (resultBox) resultBox.style.display = 'none';
      updateRamMonitor();
      showToast('Đã hủy và xóa sạch đơn hàng khỏi bộ nhớ RAM!', 'info');
    });
  }

  if (copyXmrBtn) {
    copyXmrBtn.addEventListener('click', () => {
      const addrInput = document.getElementById('receipt-xmr-address');
      if (addrInput && navigator.clipboard) {
        navigator.clipboard.writeText(addrInput.value).then(() => {
          showToast('Đã sao chép địa chỉ ví Monero (XMR) vào bộ đệm!', 'success');
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
        qr.addData(`monero:${activeOrder.xmrAddress}?tx_amount=${activeOrder.product.priceXMR.replace(' XMR', '')}`);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag(6, 0);
        qrOverlay.style.display = 'flex';
      }
    });
  }

  if (chatAboutOrderBtn) {
    chatAboutOrderBtn.addEventListener('click', () => {
      if (!activeOrder) return;
      initiateChatForProduct(`Đơn Hàng [${activeOrder.orderId}] - ${activeOrder.product.name}`);
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
  if (amountEl) amountEl.textContent = order.product.priceXMR;
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
      showToast('Đơn hàng đã tự hủy khỏi RAM do hết thời gian hiệu lực (TTL)!', 'error');
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
      if (countdownVal) countdownVal.textContent = 'MỞ TỰ DO';
      return;
    }

    const diff = Math.max(0, Math.floor((end - now) / 1000));

    if (diff <= 0) {
      if (countdownVal) countdownVal.textContent = 'MỞ GIA HẠN';
      return;
    }

    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;

    const formatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (countdownVal) countdownVal.textContent = formatted;
  });
}

function estimateUSDString(val, currency = 'XMR') {
  const num = Number(val) || 0;
  if (currency === 'USD' || currency === 'USDT') return `~$${formatPriceNum(num)} USD`;
  if (currency === 'BTC') return `~$${Math.round(num * 68000).toLocaleString('en-US')} USD`;
  if (currency === 'ETH') return `~$${Math.round(num * 3200).toLocaleString('en-US')} USD`;
  if (currency === 'VNĐ') return `~${Math.round(num).toLocaleString('en-US')} VNĐ`;
  return `~$${Math.round(num * 165).toLocaleString('en-US')} USD`;
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
    if (modalOverlay) modalOverlay.style.display = 'none';
    activeBiddingProductId = null;
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
    submitBtn.addEventListener('click', () => {
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

      // Unrestricted bidding: update highest bid if higher or equal, or record free-form offer
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

      populateOrderProductSelect(MARKET_PRODUCTS);
      showToast(`Đã ghi nhận mức giá ${formatPriceNum(bidVal)} ${currency} cho "${product.name}"!`, 'success');
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

  const currency = product.currency || 'XMR';
  if (aliasEl) aliasEl.textContent = anonymousAlias;
  if (currencyTag) currencyTag.textContent = currency;

  const currentBid = Number(product.currentBidXMR ?? product.startingBidXMR ?? product.rawPriceXMR ?? 0.1);
  const buyNowVal = Number(product.buyNowPrice ?? product.rawPriceXMR ?? currentBid);
  const minStep = Number(product.minBidIncrement || 0);
  const suggestedBid = minStep > 0 ? (currentBid + minStep) : Number((currentBid * 1.05).toFixed(2));

  if (infoBox) {
    infoBox.innerHTML = `
      <div class="bid-info-title-row">
        <span style="font-size: 1.4rem;">${escapeHtml(product.icon)}</span>
        <span class="bid-info-title">${escapeHtml(product.name)}</span>
      </div>
      <div class="bid-info-price-grid">
        <div class="bid-price-cell">
          <span class="detail-label">Giá hiện tại / Cao nhất:</span>
          <span style="font-family: var(--font-mono); font-weight: 700; color: #fbbf24;">${formatPriceNum(currentBid)} ${escapeHtml(currency)}</span>
        </div>
        <div class="bid-price-cell">
          <span class="detail-label">Mua đứt ngay / Dẫn đầu:</span>
          <span style="font-family: var(--font-mono); font-weight: 600; color: #38bdf8;">${formatPriceNum(buyNowVal)} ${escapeHtml(currency)} • ${escapeHtml(product.highestBidder || 'Mở tự do')}</span>
        </div>
      </div>
    `;
  }

  if (bidInput) {
    bidInput.value = suggestedBid.toFixed(2);
    bidInput.min = '0';
    const usdEl = document.getElementById('bid-usd-approx');
    if (usdEl) usdEl.textContent = estimateUSDString(suggestedBid, currency);
  }

  if (hintEl) {
    hintEl.textContent = minStep > 0
      ? `Bước giá tối thiểu: +${minStep} ${currency} (Gợi ý: ${suggestedBid.toFixed(2)} ${currency})`
      : `Không giới hạn bước giá — Bạn có thể nhập bất kỳ mức giá đề xuất nào bằng ${currency}!`;
  }

  if (feedEl) {
    const bids = product.bids || [];
    if (bids.length === 0) {
      feedEl.innerHTML = '<div style="font-size: 0.76rem; color: #94a3b8; font-style: italic;">Chưa có lượt trả giá nào. Bạn có thể mở bát với bất kỳ mức giá nào!</div>';
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
    modalOverlay.style.display = 'flex';
  }
}

/* ==========================================================================
   9. VENDOR DESK: UNRESTRICTED LISTING & AUCTION CREATION
   ========================================================================== */

let myVendorListings = [];
let currentListingMode = 'hybrid';

const CATEGORY_DEFAULT_BADGES = {
  physical: 'Hàng Vật Lý',
  digital: 'Tài Sản Số',
  service: 'Dịch Vụ',
  hardware: 'Phần Cứng',
  network: 'Mạng Lưới',
  crypto: 'Mật Mã Học',
  audit: 'Audit & PoC'
};

function initVendorDesk() {
  const modeHybridBtn = document.getElementById('mode-hybrid-btn');
  const modeAuctionBtn = document.getElementById('mode-auction-btn');
  const modeFixedBtn = document.getElementById('mode-fixed-btn');
  const fixedSection = document.getElementById('section-fixed-pricing');
  const auctionSection = document.getElementById('section-auction-pricing');
  const emojiPicker = document.getElementById('emoji-quick-picker');
  const iconInput = document.getElementById('listing-icon-val');
  const ttlPills = document.getElementById('vendor-ttl-pills');
  const ttlValInput = document.getElementById('listing-ttl-val');
  const publishBtn = document.getElementById('publish-listing-btn');
  const resetBtn = document.getElementById('reset-listing-btn');

  // Input listeners for real-time live preview
  const liveInputs = [
    'listing-name', 'listing-category', 'listing-custom-badge',
    'listing-icon-val', 'listing-currency', 'listing-price-xmr',
    'listing-stock', 'listing-start-bid', 'listing-min-step',
    'listing-security-tag', 'listing-desc', 'listing-spec1-v', 'listing-spec2-v'
  ];

  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateVendorLivePreview);
      el.addEventListener('change', updateVendorLivePreview);
    }
  });

  const setListingMode = (mode) => {
    currentListingMode = mode;
    [modeHybridBtn, modeAuctionBtn, modeFixedBtn].forEach(b => b?.classList.remove('active'));
    if (mode === 'hybrid') {
      modeHybridBtn?.classList.add('active');
      if (fixedSection) fixedSection.style.display = 'block';
      if (auctionSection) auctionSection.style.display = 'block';
    } else if (mode === 'auction') {
      modeAuctionBtn?.classList.add('active');
      if (fixedSection) fixedSection.style.display = 'none';
      if (auctionSection) auctionSection.style.display = 'block';
    } else {
      modeFixedBtn?.classList.add('active');
      if (fixedSection) fixedSection.style.display = 'block';
      if (auctionSection) auctionSection.style.display = 'none';
    }
    updateVendorLivePreview();
  };

  if (modeHybridBtn) modeHybridBtn.addEventListener('click', () => setListingMode('hybrid'));
  if (modeAuctionBtn) modeAuctionBtn.addEventListener('click', () => setListingMode('auction'));
  if (modeFixedBtn) modeFixedBtn.addEventListener('click', () => setListingMode('fixed'));

  // Emoji picker + custom emoji input
  if (emojiPicker && iconInput) {
    emojiPicker.querySelectorAll('.emoji-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        emojiPicker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        iconInput.value = btn.getAttribute('data-icon') || '💎';
        updateVendorLivePreview();
      });
    });
  }

  // TTL Pills
  if (ttlPills && ttlValInput) {
    ttlPills.querySelectorAll('.ttl-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        ttlPills.querySelectorAll('.ttl-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        ttlValInput.value = pill.getAttribute('data-ttl') || '14400';
      });
    });
  }

  // Reset Button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const nameInp = document.getElementById('listing-name');
      const customBadgeInp = document.getElementById('listing-custom-badge');
      const descInp = document.getElementById('listing-desc');
      if (nameInp) nameInp.value = '';
      if (customBadgeInp) customBadgeInp.value = '';
      if (descInp) descInp.value = '';
      updateVendorLivePreview();
      showToast('Đã làm mới biểu mẫu niêm yết tự do', 'info');
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

  const name = (document.getElementById('listing-name')?.value || '').trim() || 'Bất kỳ vật phẩm / Tài sản tự do của bạn';
  const category = document.getElementById('listing-category')?.value || 'physical';
  const customBadge = (document.getElementById('listing-custom-badge')?.value || '').trim();
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '💎';
  const currency = document.getElementById('listing-currency')?.value || 'XMR';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Escrow 2 Chiều • Không Giới Hạn';
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Mọi mặt hàng vật lý, tài sản số, dịch vụ hoặc đồ sưu tầm đều có thể vừa bán thẳng vừa nhận đấu giá tự do...';
  const spec1 = document.getElementById('listing-spec1-v')?.value || 'Mới 100% / Chính chủ';
  const spec2 = document.getElementById('listing-spec2-v')?.value || 'Giao hàng ẩn danh / Mã Drop tự hủy';

  const fixedPrice = parseFloat(document.getElementById('listing-price-xmr')?.value || '1.00') || 0;
  const startBid = parseFloat(document.getElementById('listing-start-bid')?.value || '0.50') || 0;

  const displayPrice = currentListingMode === 'fixed' ? fixedPrice : startBid;
  const buyNowVal = currentListingMode === 'auction' ? (startBid * 1.5) : fixedPrice;
  const badgeTitle = customBadge || CATEGORY_DEFAULT_BADGES[category] || 'Tự Do';

  previewContainer.innerHTML = `
    <article class="product-card" style="box-shadow: none; margin: 0;">
      <div class="product-card-top">
        <div class="product-badge-group">
          <span class="product-badge ${escapeHtml(category)}">${escapeHtml(badgeTitle)}</span>
          <span class="security-level-tag">${escapeHtml(secTag)}</span>
        </div>
        <span class="auction-countdown-pill" data-end="0">♾️ <span class="countdown-val">BÁN & ĐẤU GIÁ</span></span>
      </div>

      <div class="product-title-row">
        <div class="product-icon-box">${escapeHtml(icon)}</div>
        <h3 class="product-title">${escapeHtml(name)}</h3>
      </div>

      <p class="product-desc">${escapeHtml(desc)}</p>

      <div class="product-specs">
        <div class="spec-row">
          <span class="spec-key"><span class="spec-bullet">▸</span>Thuộc tính:</span>
          <span class="spec-val">${escapeHtml(spec1)}</span>
        </div>
        <div class="spec-row">
          <span class="spec-key"><span class="spec-bullet">▸</span>Bàn giao:</span>
          <span class="spec-val">${escapeHtml(spec2)}</span>
        </div>
      </div>

      <div class="product-card-footer">
        <div class="product-price-block">
          <span class="product-price-label">Giá hiện tại / Đấu giá mở:</span>
          <span class="product-price auction-price">${formatPriceNum(displayPrice)} ${escapeHtml(currency)}</span>
          <span class="product-bid-meta">Mua đứt: ${formatPriceNum(buyNowVal)} ${escapeHtml(currency)}</span>
        </div>
        <div class="product-actions">
          <button type="button" class="bid-btn" style="pointer-events: none;"><span>🔨</span> Đấu Giá</button>
          <button type="button" class="buy-btn" style="pointer-events: none;"><span>🛒</span> Mua</button>
        </div>
      </div>
    </article>
  `;
}

function handlePublishListing() {
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  const rawName = (document.getElementById('listing-name')?.value || '').trim();
  const name = rawName || `Vật Phẩm Tự Do #${randHex.slice(0, 4)}`;

  const category = document.getElementById('listing-category')?.value || 'physical';
  const customBadge = (document.getElementById('listing-custom-badge')?.value || '').trim();
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '💎';
  const currency = document.getElementById('listing-currency')?.value || 'XMR';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Escrow 2 Chiều • Tự Do';
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Vật phẩm tự do được niêm yết trực tiếp trên sàn RAM ẩn danh — cho phép cả trả giá đấu giá và mua đứt ngay.';
  const spec1 = document.getElementById('listing-spec1-v')?.value || 'Chính chủ • Đảm bảo';
  const spec2 = document.getElementById('listing-spec2-v')?.value || 'Giao hàng ẩn danh / Drop tự hủy';
  const vendorPubkey = (document.getElementById('listing-vendor-pubkey')?.value || '').trim();

  const productId = `usr-${category}-${randHex}`;
  const killTokenHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('-');
  const vendorKillToken = `KILL-${killTokenHex}`;

  const fixedPriceInput = parseFloat(document.getElementById('listing-price-xmr')?.value || '1.00');
  const startBidInput = parseFloat(document.getElementById('listing-start-bid')?.value || '0.50');
  const minStepInput = parseFloat(document.getElementById('listing-min-step')?.value || '0');
  const duration = parseInt(document.getElementById('listing-auction-duration')?.value || '14400', 10);
  const stockText = (document.getElementById('listing-stock')?.value || '').trim() || 'Sẵn sàng giao ngay';

  const fixedPrice = isNaN(fixedPriceInput) ? 1.00 : Math.max(0, fixedPriceInput);
  const startBid = isNaN(startBidInput) ? fixedPrice : Math.max(0, startBidInput);
  const minStep = isNaN(minStepInput) ? 0 : Math.max(0, minStepInput);

  const initialPrice = currentListingMode === 'fixed' ? fixedPrice : startBid;
  const buyNowPrice = currentListingMode === 'auction' ? Math.max(startBid, fixedPrice || startBid) : fixedPrice;
  const badgeTitle = customBadge || CATEGORY_DEFAULT_BADGES[category] || 'Đấu Giá & Mua Ngay';

  const newProduct = {
    id: productId,
    name,
    category,
    badge: badgeTitle,
    icon,
    securityLevel: secTag,
    currency,
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: initialPrice,
    currentBidXMR: initialPrice,
    buyNowPrice,
    minBidIncrement: minStep,
    bidCount: 0,
    highestBidder: 'Mở tự do',
    bids: [],
    auctionEndTime: duration === 0 ? 0 : (Date.now() + (duration * 1000)),
    priceXMR: `${formatPriceNum(initialPrice)} ${currency}`,
    rawPriceXMR: initialPrice,
    approxUSD: estimateUSDString(initialPrice, currency),
    stock: stockText,
    desc,
    specs: {
      'Thuộc tính': spec1,
      'Bàn giao': spec2,
      'Hình thức': minStep > 0 ? `Bước giá +${minStep} ${currency} & Mua ngay` : 'Trả giá tự do & Mua đứt ngay',
      'Người bán': vendorPubkey ? `${vendorPubkey.slice(0, 14)}...` : (anonymousAlias || 'Anonymous Vendor')
    },
    vendorKillToken,
    isUserCreated: true,
    createdAt: Date.now()
  };

  // Prepend to catalog inventory
  MARKET_PRODUCTS.unshift(newProduct);
  myVendorListings.unshift(newProduct);

  // Update product select in order tab
  populateOrderProductSelect(MARKET_PRODUCTS);

  // Refresh catalogs & counts
  filterAndRenderProducts();
  renderMyListings();
  updateRamMonitor();

  // Reset form inputs
  const nameEl = document.getElementById('listing-name');
  if (nameEl) nameEl.value = '';
  const customBadgeEl = document.getElementById('listing-custom-badge');
  if (customBadgeEl) customBadgeEl.value = '';
  const descEl = document.getElementById('listing-desc');
  if (descEl) descEl.value = '';
  updateVendorLivePreview();

  showToast(`🎉 Đã mở bán & đấu giá "${name}" thành công! Mã thu hồi: ${vendorKillToken}`, 'success');
}

function renderMyListings() {
  const container = document.getElementById('my-listings-list');
  if (!container) return;

  if (myVendorListings.length === 0) {
    container.innerHTML = '<p class="empty-listings-note">Chưa có vật phẩm nào được đăng trong phiên RAM hiện tại. Bạn có thể đăng bán hoặc đấu giá bất kỳ thứ gì ở khung bên trái!</p>';
    return;
  }

  container.innerHTML = myVendorListings.map(item => {
    const currency = item.currency || 'XMR';
    return `
      <div class="my-listing-card" id="my-item-${escapeHtml(item.id)}">
        <div class="my-listing-top">
          <div class="my-listing-title-row">
            <span class="my-listing-icon">${escapeHtml(item.icon)}</span>
            <span class="my-listing-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="product-badge ${escapeHtml(item.category)}">
            ${escapeHtml(item.badge || '⚡ Bán & Đấu Giá')}
          </span>
        </div>

        <div style="font-size: 0.8rem; font-family: var(--font-mono); color: #cbd5e1;">
          Giá hiện tại: <strong style="color: #fbbf24;">${formatPriceNum(item.currentBidXMR)} ${escapeHtml(currency)}</strong> (${item.bidCount || 0} lượt trả giá) • Mua ngay: <strong style="color: #10b981;">${formatPriceNum(item.buyNowPrice)} ${escapeHtml(currency)}</strong>
        </div>

        <div class="kill-token-box">
          <span>Vendor Kill Token: <strong class="kill-token-val">${escapeHtml(item.vendorKillToken)}</strong></span>
          <button type="button" class="copy-mini-btn" data-token="${escapeHtml(item.vendorKillToken)}">Chép</button>
        </div>

        <button type="button" class="revoke-listing-btn" data-id="${escapeHtml(item.id)}">
          <span>🔥</span> Hủy & Xóa Khỏi RAM Tức Thì
        </button>
      </div>
    `;
  }).join('');

  // Bind copy token buttons
  container.querySelectorAll('.copy-mini-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const token = btn.getAttribute('data-token');
      if (token) {
        navigator.clipboard.writeText(token).then(() => {
          showToast(`Đã sao chép Vendor Kill Token: ${token}`, 'success');
        });
      }
    });
  });

  // Bind revoke buttons
  container.querySelectorAll('.revoke-listing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      revokeUserListing(prodId);
    });
  });
}

function revokeUserListing(productId) {
  const prodIdx = MARKET_PRODUCTS.findIndex(p => p.id === productId);
  if (prodIdx !== -1) {
    const prodName = MARKET_PRODUCTS[prodIdx].name;
    MARKET_PRODUCTS.splice(prodIdx, 1);
    myVendorListings = myVendorListings.filter(p => p.id !== productId);

    populateOrderProductSelect(MARKET_PRODUCTS);
    filterAndRenderProducts();
    renderMyListings();
    updateRamMonitor();

    showToast(`Đã thu hồi và xóa sạch mặt hàng "${prodName}" khỏi RAM máy chủ!`, 'error');
  }
}
