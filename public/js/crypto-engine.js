/**
 * @file crypto-engine.js
 * @description Zero-Knowledge Cryptographic Engine using Web Crypto API.
 * 
 * Standards & Primitives:
 * - Symmetric Cipher: AES-256-GCM (256-bit key, 96-bit random IV, 128-bit authentication tag)
 * - Key Derivation: PBKDF2-HMAC-SHA256 (100,000 iterations) + HKDF-SHA256 (RFC 5869)
 * - Traffic Analysis Defense: CSPRNG Constant-Boundary Random Length Padding
 * - Asymmetric Key Exchange: ECDH (NIST P-256 / secp256r1)
 * - Transport Encodings: URL-safe Base64 (RFC 4648 §5)
 * - Memory Safety: Explicit buffer zeroing to minimize forensic residue in heap.
 */

// Universal crypto resolver (Browser window.crypto or Node.js global crypto)
const webCrypto = typeof window !== 'undefined' && window.crypto 
  ? window.crypto 
  : (typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : null);

if (!webCrypto || !webCrypto.subtle) {
  throw new Error("Web Crypto API is not supported in this runtime environment.");
}

// Armored Magic Header: 0x5A ('Z' for Zero-Knowledge)
const ENVELOPE_MAGIC = 0x5A;
const FLAG_PASSPHRASE_PROTECTED = 0x01;
const FLAG_PADDED = 0x02;

/**
 * Base64URL Encoding & Decoding utilities (RFC 4648 §5 - URL and Filename Safe)
 */
export function bufferToBase64Url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' 
    ? btoa(binary) 
    : Buffer.from(bytes).toString('base64');
  
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

/**
 * Memory hygiene: overwrites sensitive buffers with zeros to reduce residual risk in heap memory.
 * @param {Uint8Array} buffer 
 */
export function wipeMemory(buffer) {
  if (buffer && buffer instanceof Uint8Array) {
    buffer.fill(0);
  }
}

/**
 * Generates a high-entropy 256-bit symmetric AES-GCM key.
 * @returns {Promise<CryptoKey>}
 */
export async function generateSymmetricKey() {
  return await webCrypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true, // Extractable for encoding into URL fragment
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a CryptoKey to raw URL-safe Base64 string for URL fragment storage.
 * @param {CryptoKey} key 
 * @returns {Promise<string>}
 */
export async function exportKeyToBase64Url(key) {
  const rawKey = await webCrypto.subtle.exportKey("raw", key);
  const result = bufferToBase64Url(rawKey);
  wipeMemory(new Uint8Array(rawKey));
  return result;
}

/**
 * Imports a raw URL-safe Base64 string back into an AES-GCM CryptoKey.
 * @param {string} base64UrlKey 
 * @returns {Promise<CryptoKey>}
 */
export async function importKeyFromBase64Url(base64UrlKey) {
  const rawBuffer = base64UrlToBuffer(base64UrlKey);
  const key = await webCrypto.subtle.importKey(
    "raw",
    rawBuffer,
    {
      name: "AES-GCM",
      length: 256
    },
    false, // Non-extractable once imported
    ["encrypt", "decrypt"]
  );
  wipeMemory(rawBuffer);
  return key;
}

/**
 * Pads plaintext bytes to constant boundary using CSPRNG random bytes.
 * Prevents traffic analysis & size fingerprinting.
 * Envelope: [4 bytes BigEndian length] + [Plaintext] + [Random Padding]
 */
export function padPlaintext(plaintextBytes, blockSize = 256) {
  const pLen = plaintextBytes.length;
  const totalMin = 4 + pLen;
  const remainder = totalMin % blockSize;
  const paddingNeeded = remainder === 0 ? 0 : blockSize - remainder;
  const totalLen = totalMin + paddingNeeded;

  const padded = new Uint8Array(totalLen);
  const view = new DataView(padded.buffer);
  view.setUint32(0, pLen, false); // 4 bytes big endian length
  padded.set(plaintextBytes, 4);

  if (paddingNeeded > 0) {
    const padBytes = webCrypto.getRandomValues(new Uint8Array(paddingNeeded));
    padded.set(padBytes, 4 + pLen);
  }
  return padded;
}

export function unpadPlaintext(paddedBytes) {
  if (paddedBytes.length < 4) {
    throw new Error("Invalid padded package: Insufficient bytes for length header");
  }
  const view = new DataView(paddedBytes.buffer, paddedBytes.byteOffset, paddedBytes.byteLength);
  const pLen = view.getUint32(0, false);
  if (pLen > paddedBytes.length - 4) {
    throw new Error("Invalid padding: declared length exceeds buffer bounds");
  }
  return paddedBytes.slice(4, 4 + pLen);
}

/**
 * Derives a secondary key material from passphrase via PBKDF2-HMAC-SHA256 (100,000 iterations).
 */
export async function derivePassphraseBits(passphrase, salt, iterations = 100000) {
  const enc = new TextEncoder();
  const rawPass = enc.encode(passphrase);
  const baseKey = await webCrypto.subtle.importKey(
    "raw",
    rawPass,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  wipeMemory(rawPass);

  return await webCrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256"
    },
    baseKey,
    256 // 32 bytes
  );
}

/**
 * Derives composite key combining the random symmetric key and the passphrase key.
 */
export async function deriveCompositeKey(baseKey, passphrase, salt) {
  if (!passphrase) return baseKey;

  const rawBaseKey = await webCrypto.subtle.exportKey("raw", baseKey);
  const passBits = await derivePassphraseBits(passphrase, salt);

  // Combine 32B base + 32B pass = 64B IKM for HKDF
  const combinedIKM = new Uint8Array(rawBaseKey.byteLength + passBits.byteLength);
  combinedIKM.set(new Uint8Array(rawBaseKey), 0);
  combinedIKM.set(new Uint8Array(passBits), rawBaseKey.byteLength);

  const hkdfKey = await webCrypto.subtle.importKey(
    "raw",
    combinedIKM,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const enc = new TextEncoder();
  const compositeKey = await webCrypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: enc.encode("composite-passphrase-aes-gcm")
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  wipeMemory(new Uint8Array(rawBaseKey));
  wipeMemory(new Uint8Array(passBits));
  wipeMemory(combinedIKM);

  return compositeKey;
}

/**
 * Encrypts a plaintext string using AES-256-GCM with optional Constant-Boundary Padding
 * and optional 2nd-Factor Passphrase protection (PBKDF2-HMAC-SHA256).
 * 
 * Armored Structure:
 * [ 1 byte: 0x5A Magic ] + [ 1 byte: Flags ] + [ 16B Salt (optional) ] + [ 12B IV ] + [ Ciphertext + 16B Tag ]
 * 
 * @param {string} plaintext - Content to encrypt
 * @param {CryptoKey} key - AES-GCM 256-bit key
 * @param {Object} options - { pad: boolean, passphrase: string }
 * @returns {Promise<Uint8Array>} Raw binary encrypted package
 */
export async function encryptPayload(plaintext, key, options = {}) {
  const { pad = true, passphrase = '' } = options;
  const encoder = new TextEncoder();
  const rawPlaintextBytes = encoder.encode(plaintext);
  
  // Apply random padding if enabled
  let dataToEncrypt;
  let flags = 0;
  if (pad) {
    flags |= FLAG_PADDED;
    dataToEncrypt = padPlaintext(rawPlaintextBytes, 256);
    wipeMemory(rawPlaintextBytes);
  } else {
    dataToEncrypt = rawPlaintextBytes;
  }

  // Handle optional Passphrase
  let activeKey = key;
  let salt = null;
  if (passphrase) {
    flags |= FLAG_PASSPHRASE_PROTECTED;
    salt = webCrypto.getRandomValues(new Uint8Array(16));
    activeKey = await deriveCompositeKey(key, passphrase, salt);
  }

  // 96-bit (12 bytes) cryptographically secure pseudorandom IV
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt with 128-bit authentication tag appended automatically by Web Crypto
  const encryptedBuffer = await webCrypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      tagLength: 128
    },
    activeKey,
    dataToEncrypt
  );
  
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  wipeMemory(dataToEncrypt);

  // Armored Package Layout:
  const saltLen = salt ? salt.length : 0;
  const headerLen = 2 + saltLen + 12;
  const combined = new Uint8Array(headerLen + encryptedBytes.length);

  combined[0] = ENVELOPE_MAGIC;
  combined[1] = flags;
  let offset = 2;

  if (salt) {
    combined.set(salt, offset);
    offset += salt.length;
  }

  combined.set(iv, offset);
  offset += iv.length;

  combined.set(encryptedBytes, offset);
  
  return combined;
}

/**
 * Decrypts a binary payload package using AES-256-GCM.
 * Supports Armored Envelopes (with Salt, Passphrase, and Padding) and Legacy Payloads.
 * 
 * @param {Uint8Array} encryptedPackage - Encrypted package bytes
 * @param {CryptoKey} key - AES-GCM 256-bit key
 * @param {Object} options - { passphrase: string }
 * @returns {Promise<string>} Decrypted plaintext string
 */
export async function decryptPayload(encryptedPackage, key, options = {}) {
  const { passphrase = '' } = options;
  if (encryptedPackage.byteLength < 28) {
    throw new Error("Invalid payload: Insufficient bytes for envelope.");
  }

  let iv;
  let ciphertextAndTag;
  let activeKey = key;
  let isPadded = false;

  // Check if armored envelope (starts with 0x5A)
  if (encryptedPackage[0] === ENVELOPE_MAGIC) {
    const flags = encryptedPackage[1];
    const hasPassphrase = (flags & FLAG_PASSPHRASE_PROTECTED) !== 0;
    isPadded = (flags & FLAG_PADDED) !== 0;

    let offset = 2;
    if (hasPassphrase) {
      if (!passphrase) {
        throw new Error("PASSPHRASE_REQUIRED: Drop này được bảo vệ thêm bằng mật khẩu cấp 2.");
      }
      const salt = encryptedPackage.slice(offset, offset + 16);
      offset += 16;
      activeKey = await deriveCompositeKey(key, passphrase, salt);
    }

    iv = encryptedPackage.slice(offset, offset + 12);
    offset += 12;
    ciphertextAndTag = encryptedPackage.slice(offset);
  } else {
    // Legacy format compatibility: [12B IV] + [Ciphertext + Tag]
    iv = encryptedPackage.slice(0, 12);
    ciphertextAndTag = encryptedPackage.slice(12);
  }
  
  try {
    const decryptedBuffer = await webCrypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128
      },
      activeKey,
      ciphertextAndTag
    );

    const decryptedBytes = new Uint8Array(decryptedBuffer);
    let finalBytes;
    if (isPadded) {
      finalBytes = unpadPlaintext(decryptedBytes);
    } else {
      finalBytes = decryptedBytes;
    }

    const decoder = new TextDecoder();
    return decoder.decode(finalBytes);
  } catch (err) {
    if (err.message && err.message.startsWith("PASSPHRASE_REQUIRED")) {
      throw err;
    }
    throw new Error("Decryption failed: Message may be corrupted, tampered with, or key/passphrase is invalid.");
  } finally {
    if (iv) wipeMemory(iv);
  }
}

/**
 * =========================================================================
 * ECDH (Elliptic Curve Diffie-Hellman P-256) + HKDF-SHA256 for P2P Handshake
 * =========================================================================
 */

/**
 * Generates an ephemeral ECDH keypair on NIST P-256.
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateECDHKeyPair() {
  return await webCrypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}

/**
 * Exports an ECDH public key to uncompressed raw format (Base64URL encoded).
 * @param {CryptoKey} publicKey 
 * @returns {Promise<string>}
 */
export async function exportECDHPublicKey(publicKey) {
  const raw = await webCrypto.subtle.exportKey("raw", publicKey);
  return bufferToBase64Url(raw);
}

/**
 * Imports an ECDH public key from raw Base64URL string.
 * @param {string} base64UrlPublicKey 
 * @returns {Promise<CryptoKey>}
 */
export async function importECDHPublicKey(base64UrlPublicKey) {
  const raw = base64UrlToBuffer(base64UrlPublicKey);
  return await webCrypto.subtle.importKey(
    "raw",
    raw,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    []
  );
}

/**
 * Derives a 256-bit AES-GCM symmetric key using ECDH shared secret + HKDF-SHA256.
 * Provides Perfect Forward Secrecy (PFS) when ephemeral keys are used.
 * 
 * @param {CryptoKey} privateKey - Local ECDH private key
 * @param {CryptoKey} peerPublicKey - Remote party's ECDH public key
 * @param {string} saltString - Domain separation salt
 * @param {string} infoString - Context info parameter
 * @returns {Promise<CryptoKey>}
 */
export async function deriveECDHSharedKey(privateKey, peerPublicKey, saltString = "tu-dien-da-ngon-ngu-salt", infoString = "ephemeral-drop-hkdf") {
  // Step 1: Derive raw shared secret bits (256 bits)
  const sharedSecretBits = await webCrypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: peerPublicKey
    },
    privateKey,
    256
  );
  
  // Step 2: Import shared bits as HKDF key material
  const hkdfKey = await webCrypto.subtle.importKey(
    "raw",
    sharedSecretBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
  
  const encoder = new TextEncoder();
  const salt = encoder.encode(saltString);
  const info = encoder.encode(infoString);
  
  // Step 3: Expand into AES-256-GCM symmetric key
  const aesKey = await webCrypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: info
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
  
  wipeMemory(new Uint8Array(sharedSecretBits));
  return aesKey;
}

/**
 * Client-Side URL Fragment Packing & Unpacking (Zero-Knowledge Rule)
 * 
 * Per RFC 3986 §3.5, the Fragment Identifier (#...) is evaluated exclusively
 * by the User Agent and is NEVER transmitted over the wire in HTTP GET/POST headers.
 */

export function buildDropUrl(dropId, base64UrlKey, baseUrl = window.location.origin) {
  // Disguised path: /#lexicon-entry?id=...&k=...
  return `${baseUrl}/#entry?id=${encodeURIComponent(dropId)}&k=${encodeURIComponent(base64UrlKey)}`;
}

export function parseDropUrlFragment() {
  if (typeof window === 'undefined' || !window.location.hash) {
    return null;
  }
  
  const hash = window.location.hash.substring(1); // strip leading '#'
  const questionIndex = hash.indexOf('?');
  const queryPart = questionIndex !== -1 ? hash.substring(questionIndex + 1) : hash;
  
  const params = new URLSearchParams(queryPart);
  const dropId = params.get('id');
  const key = params.get('k');
  
  if (dropId && key) {
    return { dropId, key };
  }
  return null;
}

/**
 * Strips secret fragment from browser address bar without triggering page reload.
 * Ensures the key cannot be captured from shoulder surfing or browser history.
 */
export function purgeUrlFragment() {
  if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }
}
