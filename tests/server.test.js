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
