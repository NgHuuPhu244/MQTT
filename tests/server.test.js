import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer, storeDrop, retrieveDrop } from '../server.js';

describe('Server RAM-Only & Ephemeral Drop Tests', () => {
  let server;
  let baseUrl;
  let port;

  before((_, done) => {
    server = createServer();
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  it('should store and retrieve in volatile RAM directly', () => {
    const id = 'test-drop-1';
    const data = Buffer.from('encrypted-sample-payload-123456');

    storeDrop({
      id,
      ciphertextBuffer: data,
      burnAfterReading: true,
      ttlSeconds: 60
    });

    const retrieved1 = retrieveDrop(id);
    assert.ok(retrieved1, 'First retrieval should succeed');
    assert.strictEqual(retrieved1.toString('utf8'), 'encrypted-sample-payload-123456');

    // Burn-after-reading verification
    const retrieved2 = retrieveDrop(id);
    assert.strictEqual(retrieved2, null, 'Second retrieval must fail (Burned from RAM)');
  });

  it('should support non-burn-after-reading drops until TTL expires', () => {
    const id = 'test-drop-persist';
    const data = Buffer.from('multi-read-payload');

    storeDrop({
      id,
      ciphertextBuffer: data,
      burnAfterReading: false,
      ttlSeconds: 10
    });

    const read1 = retrieveDrop(id);
    const read2 = retrieveDrop(id);
    assert.strictEqual(read1.toString('utf8'), 'multi-read-payload');
    assert.strictEqual(read2.toString('utf8'), 'multi-read-payload');
  });

  it('should reject payload exceeding MAX_PAYLOAD_SIZE', () => {
    const id = 'oversized-drop';
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

    assert.throws(() => {
      storeDrop({
        id,
        ciphertextBuffer: hugeBuffer,
        burnAfterReading: true
      });
    }, /exceeds maximum allowed size/);
  });

  it('should create and retrieve a drop via HTTP API with Burn-After-Reading', async () => {
    const postPayload = JSON.stringify({
      ciphertext: 'U2FsdGVkX19randomBase64CipherPackageBytesHere==',
      burnAfterReading: true,
      ttl: 300
    });

    // 1. POST drop to camouflaged endpoint /api/lexicon/cache-entry
    const postRes = await makeRequest(`${baseUrl}/api/lexicon/cache-entry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postPayload)
      },
      body: postPayload
    });

    assert.strictEqual(postRes.statusCode, 201);
    const postData = JSON.parse(postRes.body);
    assert.ok(postData.id, 'Response should contain drop id');
    const dropId = postData.id;

    // Verify Security Headers
    assert.strictEqual(postRes.headers['cache-control'], 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    assert.strictEqual(postRes.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(postRes.headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(postRes.headers['server'], 'LexiconServer/2.4');

    // 2. GET drop (1st retrieval - should succeed)
    const getRes1 = await makeRequest(`${baseUrl}/api/lexicon/cache-entry/${dropId}`, {
      method: 'GET'
    });
    assert.strictEqual(getRes1.statusCode, 200);
    const getData1 = JSON.parse(getRes1.body);
    assert.strictEqual(getData1.ciphertext, 'U2FsdGVkX19randomBase64CipherPackageBytesHere==');

    // 3. GET drop (2nd retrieval - should be completely burned with 404)
    const getRes2 = await makeRequest(`${baseUrl}/api/lexicon/cache-entry/${dropId}`, {
      method: 'GET'
    });
    assert.strictEqual(getRes2.statusCode, 404);
  });

  it('should serve decoy dictionary query correctly', async () => {
    const res = await makeRequest(`${baseUrl}/api/lexicon/query?q=Zero-Knowledge`, {
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'success');
    assert.ok(json.count >= 1);
    assert.strictEqual(json.data[0].word, 'Zero-Knowledge');
  });

  it('should serve stealth vault page at /vault with strict security headers', async () => {
    const res = await makeRequest(`${baseUrl}/vault`, {
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('ZERO-KNOWLEDGE EPHEMERAL VAULT'));
    assert.strictEqual(res.headers['cache-control'], 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    assert.strictEqual(res.headers['referrer-policy'], 'no-referrer');
  });

  it('should validate wiki-summary endpoint query parameter', async () => {
    const res = await makeRequest(`${baseUrl}/api/lexicon/wiki-summary`, {
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 400);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.error, 'Missing search term');
  });

  it('should return empty list when opensearch query is empty', async () => {
    const res = await makeRequest(`${baseUrl}/api/lexicon/opensearch`, {
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 200);
    const list = JSON.parse(res.body);
    assert.deepStrictEqual(list, []);
  });

  it('should list bazaar items from volatile RAM', async () => {
    const res = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items`, {
      method: 'GET'
    });

    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'success');
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length >= 7);
  });

  it('should publish, bid on, and revoke an item via Bazaar REST API', async () => {
    // 1. Publish new item
    const postPayload = JSON.stringify({
      name: 'Thiết Bị Cổng Node 01 RAM Test',
      category: 'hardware',
      startingBidXMR: 1.20,
      buyNowPrice: 2.50,
      currency: 'XMR',
      stock: '2 chiếc'
    });

    const postRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postPayload)
      },
      body: postPayload
    });

    assert.strictEqual(postRes.statusCode, 201);
    const postData = JSON.parse(postRes.body);
    assert.strictEqual(postData.status, 'success');
    assert.ok(postData.product.id);
    assert.ok(postData.product.vendorKillToken);

    const productId = postData.product.id;
    const killToken = postData.product.vendorKillToken;

    // 2. Submit bid on the published item
    const bidPayload = JSON.stringify({
      bidder: 'Ghost-TESTER',
      amount: 1.80,
      currency: 'XMR'
    });

    const bidRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items/${encodeURIComponent(productId)}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bidPayload)
      },
      body: bidPayload
    });

    assert.strictEqual(bidRes.statusCode, 200);
    const bidData = JSON.parse(bidRes.body);
    assert.strictEqual(bidData.status, 'success');
    assert.strictEqual(bidData.product.highestBidder, 'Ghost-TESTER');
    assert.strictEqual(bidData.product.currentBidXMR, 1.80);
    assert.ok(bidData.product.bids.length >= 1);

    // 3. Revoke with invalid token should fail
    const badRevokePayload = JSON.stringify({
      vendorKillToken: 'WRONG-TOKEN'
    });
    const badRevokeRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items/${encodeURIComponent(productId)}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(badRevokePayload)
      },
      body: badRevokePayload
    });
    assert.strictEqual(badRevokeRes.statusCode, 403);

    // 4. Revoke with valid killToken should succeed
    const okRevokePayload = JSON.stringify({
      vendorKillToken: killToken
    });
    const okRevokeRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items/${encodeURIComponent(productId)}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(okRevokePayload)
      },
      body: okRevokePayload
    });
    assert.strictEqual(okRevokeRes.statusCode, 200);

    // 5. Verify item no longer exists in RAM list
    const checkRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items`, {
      method: 'GET'
    });
    const checkData = JSON.parse(checkRes.body);
    const found = checkData.data.find(p => p.id === productId);
    assert.strictEqual(found, undefined);
  });

  it('should auto-generate blind deal code, relay blinded messages, confirm escrow, and auto-burn chat on completion', async () => {
    // 1. Buyer clicks chat -> auto-init deal
    const initPayload = JSON.stringify({
      action: 'init',
      productId: 'hw-hsm-01',
      productName: 'Khóa Bảo Mật Air-Gapped HSM Token v4'
    });
    const initRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(initPayload)
      },
      body: initPayload
    });
    assert.strictEqual(initRes.statusCode, 201);
    const initData = JSON.parse(initRes.body);
    assert.ok(initData.deal.dealId.startsWith('DEAL-'));
    assert.ok(initData.deal.buyerBlindId.includes('[IP & ID: ĐÃ ẨN]'));
    assert.ok(initData.deal.sellerBlindId.includes('[IP & ID: ĐÃ ẨN]'));

    const dealId = initData.deal.dealId;

    // 2. Buyer sends message -> Seller receives with blinded identity
    const msgPayload = JSON.stringify({
      action: 'message',
      dealId,
      senderRole: 'buyer',
      text: 'Chào shop, tôi muốn mua sản phẩm này qua ký quỹ!'
    });
    const msgRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(msgPayload)
      },
      body: msgPayload
    });
    assert.strictEqual(msgRes.statusCode, 200);
    const msgData = JSON.parse(msgRes.body);
    assert.strictEqual(msgData.deal.messages.length, 2);

    // 3. Complete purchase & payment -> auto-burn deal & wipe chat from RAM
    const burnPayload = JSON.stringify({
      action: 'complete_and_burn',
      dealId
    });
    const burnRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(burnPayload)
      },
      body: burnPayload
    });
    assert.strictEqual(burnRes.statusCode, 200);
    const burnData = JSON.parse(burnRes.body);
    assert.strictEqual(burnData.burnedDealId, dealId);

    // 4. Subsequent GET returns null deal (completely vanished from RAM)
    const getAfterBurn = await makeRequest(`${baseUrl}/api/lexicon/bazaar-deals`, {
      method: 'GET'
    });
    const afterData = JSON.parse(getAfterBurn.body);
    assert.strictEqual(afterData.deal, null);
    assert.strictEqual(afterData.lastBurnedDealId, dealId);
    assert.ok(afterData.soldOrRevokedIds.includes('hw-hsm-01'));

    // 5. Verify the purchased product ('hw-hsm-01') has automatically disappeared from the marketplace RAM
    const itemsAfterBuyRes = await makeRequest(`${baseUrl}/api/lexicon/bazaar-items`, {
      method: 'GET'
    });
    const itemsAfterBuy = JSON.parse(itemsAfterBuyRes.body);
    const soldItemStillPresent = itemsAfterBuy.data.find(p => p.id === 'hw-hsm-01');
    assert.strictEqual(soldItemStillPresent, undefined);
  });
});

/**
 * Helper to make HTTP requests with promises
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}
