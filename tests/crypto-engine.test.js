import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateSymmetricKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  encryptPayload,
  decryptPayload,
  generateECDHKeyPair,
  exportECDHPublicKey,
  importECDHPublicKey,
  deriveECDHSharedKey,
  bufferToBase64Url,
  base64UrlToBuffer,
  wipeMemory
} from '../public/js/crypto-engine.js';

describe('Zero-Knowledge Cryptographic Engine Tests', () => {
  it('should generate, export, and import AES-256-GCM keys accurately', async () => {
    const key = await generateSymmetricKey();
    const exportedB64 = await exportKeyToBase64Url(key);
    
    assert.strictEqual(typeof exportedB64, 'string');
    assert.ok(exportedB64.length > 30, 'Key length should be appropriate for 256-bit');
    
    const reimportedKey = await importKeyFromBase64Url(exportedB64);
    assert.strictEqual(reimportedKey.algorithm.name, 'AES-GCM');
    assert.strictEqual(reimportedKey.algorithm.length, 256);
  });

  it('should encrypt and decrypt payloads with 100% fidelity', async () => {
    const secretMessage = 'Tuyệt mật: Tọa độ điểm hẹn & Khóa trao đổi nội bộ 2026';
    const key = await generateSymmetricKey();

    const encryptedPackage = await encryptPayload(secretMessage, key);
    
    // Check package structure: 12B IV + encrypted data
    assert.ok(encryptedPackage.byteLength >= 12 + 16, 'Package must contain at least IV + Tag');

    const decryptedText = await decryptPayload(encryptedPackage, key);
    assert.strictEqual(decryptedText, secretMessage);
  });

  it('should reject tampered ciphertext or altered GCM tag', async () => {
    const message = 'Classified operational instructions';
    const key = await generateSymmetricKey();
    const encryptedPackage = await encryptPayload(message, key);

    // Tamper with the last byte (part of authentication tag)
    const tampered = new Uint8Array(encryptedPackage);
    tampered[tampered.length - 1] ^= 0x01;

    await assert.rejects(
      async () => {
        await decryptPayload(tampered, key);
      },
      /Decryption failed/,
      'Tampered payload must trigger cryptographic authentication failure'
    );
  });

  it('should perform ECDH P-256 key exchange + HKDF-SHA256 successfully', async () => {
    // Alice generates keypair
    const aliceKeyPair = await generateECDHKeyPair();
    const alicePubB64 = await exportECDHPublicKey(aliceKeyPair.publicKey);

    // Bob generates keypair
    const bobKeyPair = await generateECDHKeyPair();
    const bobPubB64 = await exportECDHPublicKey(bobKeyPair.publicKey);

    // Exchange public keys across channel
    const aliceImportedBobPub = await importECDHPublicKey(bobPubB64);
    const bobImportedAlicePub = await importECDHPublicKey(alicePubB64);

    // Both derive symmetric AES-256-GCM key independently
    const aliceDerivedKey = await deriveECDHSharedKey(aliceKeyPair.privateKey, aliceImportedBobPub);
    const bobDerivedKey = await deriveECDHSharedKey(bobKeyPair.privateKey, bobImportedAlicePub);

    // Alice encrypts for Bob
    const aliceMessage = 'Bảo mật tuyệt đối qua kênh P2P ECDH + HKDF';
    const cipherFromAlice = await encryptPayload(aliceMessage, aliceDerivedKey);

    // Bob decrypts Alice\'s message
    const bobDecrypted = await decryptPayload(cipherFromAlice, bobDerivedKey);
    assert.strictEqual(bobDecrypted, aliceMessage);
  });

  it('should zero out buffers during memory wipe', () => {
    const sensitive = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    wipeMemory(sensitive);
    assert.deepStrictEqual(sensitive, new Uint8Array(8));
  });

  it('should correctly handle Base64URL without unsafe characters (+, /, =)', () => {
    const raw = new Uint8Array([251, 255, 254, 253, 252]);
    const b64Url = bufferToBase64Url(raw);
    assert.ok(!b64Url.includes('+'), 'Should not contain +');
    assert.ok(!b64Url.includes('/'), 'Should not contain /');
    assert.ok(!b64Url.includes('='), 'Should not contain =');

    const recovered = base64UrlToBuffer(b64Url);
    assert.deepStrictEqual(recovered, raw);
  });

  it('should enforce constant-boundary random padding (defense against length analysis)', async () => {
    const key = await generateSymmetricKey();
    const shortText = 'Hi'; // 2 bytes
    const encrypted = await encryptPayload(shortText, key, { pad: true });

    // Header 2B + 12B IV + encrypted buffer + 16B tag
    // Since plaintext is padded to 256 bytes, encrypted data should be 256 + 16 = 272 bytes
    assert.strictEqual(encrypted.length, 2 + 12 + 256 + 16);

    const decrypted = await decryptPayload(encrypted, key);
    assert.strictEqual(decrypted, shortText);
  });

  it('should support dual-factor passphrase protection (PBKDF2-HMAC-SHA256)', async () => {
    const key = await generateSymmetricKey();
    const secret = 'Tuyệt mật: Khóa 2 lớp bảo vệ';
    const passphrase = 'SuperSecretPassphrase2026!';

    // Encrypt with both Key and Passphrase
    const encrypted = await encryptPayload(secret, key, { pad: true, passphrase });

    // 1. Decrypt with wrong passphrase -> should fail
    await assert.rejects(
      async () => {
        await decryptPayload(encrypted, key, { passphrase: 'WrongPassword' });
      },
      /Decryption failed/
    );

    // 2. Decrypt without passphrase -> should prompt PASSPHRASE_REQUIRED
    await assert.rejects(
      async () => {
        await decryptPayload(encrypted, key);
      },
      /PASSPHRASE_REQUIRED/
    );

    // 3. Decrypt with correct passphrase -> succeeds
    const decrypted = await decryptPayload(encrypted, key, { passphrase });
    assert.strictEqual(decrypted, secret);
  });
});
