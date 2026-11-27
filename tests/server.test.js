import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createServer,
  storeDrop,
  retrieveDrop,
  resetCompanyWorkspaceForTests,
  reloadCompanyWorkspaceFromDiskForTests,
  expireSessionForTests
} from '../server.js';
import {
  generateSymmetricKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  bufferToBase64Url,
  base64UrlToBuffer,
  encryptPayload,
  decryptPayload
} from '../public/js/crypto-engine.js';

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
    assert.ok(initData.deal.buyerBlindId.startsWith('ID-Mua #'));
    assert.ok(initData.deal.sellerBlindId.startsWith('ID-Bán #'));

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


describe('Closed-Company 3-Role RBAC Tests (Employee / Manager / Director)', () => {
  let server;
  let baseUrl;

  before((_, done) => {
    resetCompanyWorkspaceForTests();
    server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  async function loginAs(username, password = '123') {
    const res = await makeRequest(`${baseUrl}/api/company/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return { status: res.statusCode, data: JSON.parse(res.body) };
  }

  it('should sanitize accounts directory and reject wrong password with 401', async () => {
    const dirRes = await makeRequest(`${baseUrl}/api/company/accounts-directory`, { method: 'GET' });
    assert.strictEqual(dirRes.statusCode, 200);
    const dirData = JSON.parse(dirRes.body);
    assert.ok(Array.isArray(dirData.accounts) && dirData.accounts.length >= 9);
    dirData.accounts.forEach(acc => {
      assert.strictEqual(acc.password, undefined);
    });

    const badLogin = await loginAs('nv.devops1', 'wrong-pass');
    assert.strictEqual(badLogin.status, 401);
  });

  it('should strictly isolate Employee to own department projects/rooms and enforce 403 on restricted actions', async () => {
    resetCompanyWorkspaceForTests();
    const emp = await loginAs('nv.devops1');
    assert.strictEqual(emp.status, 200);
    const token = emp.data.token;

    // Projects strictly filtered to devops
    assert.ok(emp.data.projects.length >= 1);
    assert.ok(emp.data.projects.every(p => p.department === 'devops'));

    // Rooms strictly filtered to active devops rooms (never other depts or executive rooms)
    assert.ok(emp.data.rooms.length >= 1);
    assert.ok(emp.data.rooms.every(r => r.department === 'devops' && r.status === 'active'));

    // 403 checks for Employee
    const createProjRes = await makeRequest(`${baseUrl}/api/company/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({ name: 'Unauthorized Project' })
    });
    assert.strictEqual(createProjRes.statusCode, 403);

    const createRoomRes = await makeRequest(`${baseUrl}/api/company/rooms/request-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({ name: 'Unauthorized Room', scope: 'department' })
    });
    assert.strictEqual(createRoomRes.statusCode, 403);

    const reqDelRes = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/request-delete`, {
      method: 'POST',
      headers: { 'X-Session-Token': token }
    });
    assert.strictEqual(reqDelRes.statusCode, 403);

    const crossDeptMsg = await makeRequest(`${baseUrl}/api/company/rooms/room-it-main/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({ text: 'Intrusion attempt' })
    });
    assert.strictEqual(crossDeptMsg.statusCode, 403);

    // Allowed own-dept room message succeeds
    const ownDeptMsg = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({ text: 'Báo cáo tiến độ từ DevOps employee.' })
    });
    assert.strictEqual(ownDeptMsg.statusCode, 200);
  });

  it('should require Director approval before Manager-requested room creation activates or deletion executes', async () => {
    resetCompanyWorkspaceForTests();
    const emp = await loginAs('nv.devops1');
    const mgr = await loginAs('ql.devops');
    const dir = await loginAs('giamdoc');

    // Manager cannot create cross-dept or executive rooms
    const badScope = await makeRequest(`${baseUrl}/api/company/rooms/request-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgr.data.token },
      body: JSON.stringify({ name: 'Mgr Bad Scope', scope: 'manager_director' })
    });
    assert.strictEqual(badScope.statusCode, 403);

    // Manager requests a new work room -> pending_create
    const reqCreate = await makeRequest(`${baseUrl}/api/company/rooms/request-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgr.data.token },
      body: JSON.stringify({ name: 'Phòng Công Việc Sprint 16', scope: 'work' })
    });
    assert.strictEqual(reqCreate.statusCode, 201);
    const createdData = JSON.parse(reqCreate.body);
    assert.strictEqual(createdData.status, 'pending_approval');
    assert.strictEqual(createdData.room.status, 'pending_create');
    const newRoomId = createdData.room.id;

    // Employee MUST NOT see or post in unapproved pending_create room
    const empStateBefore = await makeRequest(`${baseUrl}/api/company/state`, {
      method: 'GET',
      headers: { 'X-Session-Token': emp.data.token }
    });
    const empBeforeJson = JSON.parse(empStateBefore.body);
    assert.strictEqual(empBeforeJson.rooms.find(r => r.id === newRoomId), undefined);

    const empPostBefore = await makeRequest(`${baseUrl}/api/company/rooms/${newRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': emp.data.token },
      body: JSON.stringify({ text: 'Trying before approval' })
    });
    assert.strictEqual(empPostBefore.statusCode, 403);

    // Manager CANNOT self-approve
    const selfApprove = await makeRequest(`${baseUrl}/api/company/approvals/${newRoomId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgr.data.token },
      body: JSON.stringify({ decision: 'approve' })
    });
    assert.strictEqual(selfApprove.statusCode, 403);

    // Director approves creation
    const dirApproveCreate = await makeRequest(`${baseUrl}/api/company/approvals/${newRoomId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({ decision: 'approve' })
    });
    assert.strictEqual(dirApproveCreate.statusCode, 200);
    assert.strictEqual(JSON.parse(dirApproveCreate.body).room.status, 'active');

    // Employee now sees room and can post message
    const empPostAfter = await makeRequest(`${baseUrl}/api/company/rooms/${newRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': emp.data.token },
      body: JSON.stringify({ text: 'Đã vào được phòng sau khi Giám đốc duyệt!' })
    });
    assert.strictEqual(empPostAfter.statusCode, 200);

    // Manager requests deletion -> stays in RAM as pending_delete until Director approves
    const reqDelete = await makeRequest(`${baseUrl}/api/company/rooms/${newRoomId}/request-delete`, {
      method: 'POST',
      headers: { 'X-Session-Token': mgr.data.token }
    });
    assert.strictEqual(reqDelete.statusCode, 200);
    assert.strictEqual(JSON.parse(reqDelete.body).room.status, 'pending_delete');

    // Reject delete restores room -> re-request delete -> Approve permanently removes room
    const dirRejectDel = await makeRequest(`${baseUrl}/api/company/approvals/${newRoomId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({ decision: 'reject' })
    });
    assert.strictEqual(dirRejectDel.statusCode, 200);
    assert.strictEqual(JSON.parse(dirRejectDel.body).room.status, 'active');

    await makeRequest(`${baseUrl}/api/company/rooms/${newRoomId}/request-delete`, {
      method: 'POST',
      headers: { 'X-Session-Token': mgr.data.token }
    });
    const dirApproveDel = await makeRequest(`${baseUrl}/api/company/approvals/${newRoomId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({ decision: 'approve' })
    });
    assert.strictEqual(dirApproveDel.statusCode, 200);
    assert.strictEqual(JSON.parse(dirApproveDel.body).status, 'deleted');

    const empStateAfterDel = await makeRequest(`${baseUrl}/api/company/state`, {
      method: 'GET',
      headers: { 'X-Session-Token': emp.data.token }
    });
    assert.strictEqual(JSON.parse(empStateAfterDel.body).rooms.find(r => r.id === newRoomId), undefined);
  });

  it('should allow Director to add Managers, coordinate/reassign departments, and open leadership chat rooms', async () => {
    resetCompanyWorkspaceForTests();
    const mgrDevops = await loginAs('ql.devops');
    const mgrFin = await loginAs('ql.fin');
    const mgrIt = await loginAs('ql.it');
    const emp = await loginAs('nv.devops1');
    const dir = await loginAs('giamdoc');

    // Non-director cannot add a manager
    const mgrAddAttempt = await makeRequest(`${baseUrl}/api/company/managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({ name: 'Rogue Mgr', username: 'ql.rogue', department: 'devops' })
    });
    assert.strictEqual(mgrAddAttempt.statusCode, 403);

    // Director adds new manager ql.sec2 in devops
    const addMgrRes = await makeRequest(`${baseUrl}/api/company/managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({
        name: 'Nguyễn Minh Hải',
        username: 'ql.devops2',
        password: '123',
        department: 'devops',
        title: 'Phó Trưởng ban DevOps'
      })
    });
    assert.strictEqual(addMgrRes.statusCode, 201);
    const createdMgr = JSON.parse(addMgrRes.body).manager;
    assert.strictEqual(createdMgr.department, 'devops');

    // Director coordinates/reassigns ql.devops2 to network department
    const coordRes = await makeRequest(`${baseUrl}/api/company/managers/${createdMgr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({ department: 'network' })
    });
    assert.strictEqual(coordRes.statusCode, 200);
    assert.strictEqual(JSON.parse(coordRes.body).manager.department, 'network');

    // New manager logs in and immediately inherits network department visibility
    const newMgrSession = await loginAs('ql.devops2', '123');
    assert.strictEqual(newMgrSession.status, 200);
    assert.strictEqual(newMgrSession.data.user.department, 'network');
    assert.ok(newMgrSession.data.rooms.some(r => r.id === 'room-net-main'));
    assert.strictEqual(newMgrSession.data.rooms.some(r => r.id === 'room-devops-main'), false);

    // Director creates manager_to_manager room ONLY between DevOps & Finance managers
    const execRoomRes = await makeRequest(`${baseUrl}/api/company/rooms/request-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({
        name: 'Phối hợp Quản lí DevOps ↔ Tài chính',
        scope: 'manager_to_manager',
        participantIds: ['u-mgr-devops', 'u-mgr-fin'],
        includeAllManagers: false
      })
    });
    assert.strictEqual(execRoomRes.statusCode, 201);
    const execRoomId = JSON.parse(execRoomRes.body).room.id;

    // Participating managers see & can post; non-participating IT manager & Employee CANNOT
    const finPost = await makeRequest(`${baseUrl}/api/company/rooms/${execRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrFin.data.token },
      body: JSON.stringify({ text: 'Ngân sách Q4 đã sẵn sàng cho DevOps.' })
    });
    assert.strictEqual(finPost.statusCode, 200);

    const itPost = await makeRequest(`${baseUrl}/api/company/rooms/${execRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrIt.data.token },
      body: JSON.stringify({ text: 'Unauthorized IT mgr' })
    });
    assert.strictEqual(itPost.statusCode, 403);

    const empPost = await makeRequest(`${baseUrl}/api/company/rooms/${execRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': emp.data.token },
      body: JSON.stringify({ text: 'Unauthorized employee' })
    });
    assert.strictEqual(empPost.statusCode, 403);
  });

  it('should persist scrypt-hashed password change and rooms across disk reload', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-persist-'));
    try {
      resetCompanyWorkspaceForTests(tmpDir);
      const emp = await loginAs('nv.devops1', '123');
      assert.strictEqual(emp.status, 200);

      // Change password for nv.devops1
      const chgRes = await makeRequest(`${baseUrl}/api/company/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': emp.data.token },
        body: JSON.stringify({ currentPassword: '123', newPassword: 'MatKhauMoi@99' })
      });
      assert.strictEqual(chgRes.statusCode, 200);

      // Verify state file saved with scrypt hash (never plaintext password)
      const savedJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'company-state.json'), 'utf8'));
      const savedUser = savedJson.users.find(u => u.username === 'nv.devops1');
      assert.ok(savedUser.passwordHash.startsWith('scrypt:'));
      assert.strictEqual(savedUser.password, undefined);

      // Simulate server restart reading from disk
      reloadCompanyWorkspaceFromDiskForTests(tmpDir);
      const oldLogin = await loginAs('nv.devops1', '123');
      assert.strictEqual(oldLogin.status, 401);

      const newLogin = await loginAs('nv.devops1', 'MatKhauMoi@99');
      assert.strictEqual(newLogin.status, 200);
    } finally {
      resetCompanyWorkspaceForTests();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should allow Manager to add/lock own-dept Employee with immediate session revocation and enforce 403 cross-dept', async () => {
    resetCompanyWorkspaceForTests();
    const mgrDevops = await loginAs('ql.devops');
    const empDevops = await loginAs('nv.devops1');

    // Employee cannot add another employee
    const empAttempt = await makeRequest(`${baseUrl}/api/company/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': empDevops.data.token },
      body: JSON.stringify({ name: 'Hacker', username: 'nv.hack' })
    });
    assert.strictEqual(empAttempt.statusCode, 403);

    // Manager cannot add employee to another department
    const crossAdd = await makeRequest(`${baseUrl}/api/company/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({ name: 'Other Dept Emp', username: 'nv.it2', department: 'admin_it' })
    });
    assert.strictEqual(crossAdd.statusCode, 403);

    // Manager adds employee to own department
    const addEmpRes = await makeRequest(`${baseUrl}/api/company/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({ name: 'Lê Minh Tuấn', username: 'nv.devops2', department: 'devops', title: 'Kỹ sư SRE' })
    });
    assert.strictEqual(addEmpRes.statusCode, 201);
    const newEmp = JSON.parse(addEmpRes.body).employee;

    // New employee logs in cleanly
    const newEmpLogin = await loginAs('nv.devops2', '123');
    assert.strictEqual(newEmpLogin.status, 200);

    // Manager locks nv.devops2 -> existing session token immediately invalidated (401)
    const lockRes = await makeRequest(`${baseUrl}/api/company/employees/${newEmp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({ active: false })
    });
    assert.strictEqual(lockRes.statusCode, 200);

    const stateAfterLock = await makeRequest(`${baseUrl}/api/company/state`, {
      method: 'GET',
      headers: { 'X-Session-Token': newEmpLogin.data.token }
    });
    assert.strictEqual(stateAfterLock.statusCode, 401);

    const lockedRelogin = await loginAs('nv.devops2', '123');
    assert.strictEqual(lockedRelogin.status, 403);
  });

  it('should enforce RBAC on project deletion, task assignment, message-level delete approval, and chat attachments', async () => {
    resetCompanyWorkspaceForTests();
    const empDevops = await loginAs('nv.devops1');
    const empIt = await loginAs('nv.it1');
    const mgrDevops = await loginAs('ql.devops');
    const dir = await loginAs('giamdoc');

    // 1. Task assignment & progress RBAC
    const empAssignAttempt = await makeRequest(`${baseUrl}/api/company/projects/auction-chip-07/task`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': empDevops.data.token },
      body: JSON.stringify({ assigneeId: 'u-emp-devops' })
    });
    assert.strictEqual(empAssignAttempt.statusCode, 403);

    const mgrAssignRes = await makeRequest(`${baseUrl}/api/company/projects/auction-chip-07/task`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({ assigneeId: 'u-emp-devops', taskStatus: 'in_progress', dueDate: '2026-12-01' })
    });
    assert.strictEqual(mgrAssignRes.statusCode, 200);
    assert.strictEqual(JSON.parse(mgrAssignRes.body).project.assigneeName, 'Trần Minh Quân');

    const empProgressRes = await makeRequest(`${baseUrl}/api/company/projects/auction-chip-07/task`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': empDevops.data.token },
      body: JSON.stringify({ taskStatus: 'review' })
    });
    assert.strictEqual(empProgressRes.statusCode, 200);
    assert.strictEqual(JSON.parse(empProgressRes.body).project.taskStatus, 'review');

    // 2. Attachment upload & unsafe extension block + cross-dept download 403
    const unsafeFileRes = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({
        text: '@nv.devops1 xem file',
        attachment: { name: 'xss.html', mimeType: 'text/html', dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64') }
      })
    });
    assert.strictEqual(unsafeFileRes.statusCode, 400);

    const safeFileRes = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({
        text: '@nv.devops1 kiểm tra tài liệu cấu hình',
        attachment: { name: 'gateway-config.txt', mimeType: 'text/plain', dataBase64: Buffer.from('PORT=3000').toString('base64') }
      })
    });
    assert.strictEqual(safeFileRes.statusCode, 200);
    const postedMsg = JSON.parse(safeFileRes.body).message;
    assert.ok(postedMsg.mentions.includes('nv.devops1'));
    assert.ok(postedMsg.attachment && postedMsg.attachment.id);

    // Cross-dept employee blocked from downloading DevOps attachment
    const itDownload = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/attachments/${postedMsg.attachment.id}`, {
      method: 'GET',
      headers: { 'X-Session-Token': empIt.data.token }
    });
    assert.strictEqual(itDownload.statusCode, 403);

    const devopsDownload = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/attachments/${postedMsg.attachment.id}`, {
      method: 'GET',
      headers: { 'X-Session-Token': empDevops.data.token }
    });
    assert.strictEqual(devopsDownload.statusCode, 200);
    assert.strictEqual(devopsDownload.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(devopsDownload.body, 'PORT=3000');

    // 3. Message-level deletion requires Director approval
    const empMsgDel = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages/${postedMsg.id}/request-delete`, {
      method: 'POST',
      headers: { 'X-Session-Token': empDevops.data.token }
    });
    assert.strictEqual(empMsgDel.statusCode, 403);

    const mgrMsgDel = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages/${postedMsg.id}/request-delete`, {
      method: 'POST',
      headers: { 'X-Session-Token': mgrDevops.data.token }
    });
    assert.strictEqual(mgrMsgDel.statusCode, 200);
    assert.strictEqual(JSON.parse(mgrMsgDel.body).status, 'pending_delete');

    // Manager cannot approve own message deletion
    const mgrSelfMsgApprove = await makeRequest(`${baseUrl}/api/company/approvals/messages/room-devops-main/${postedMsg.id}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
      body: JSON.stringify({ decision: 'approve' })
    });
    assert.strictEqual(mgrSelfMsgApprove.statusCode, 403);

    // Director approves message deletion -> message removed permanently
    const dirMsgApprove = await makeRequest(`${baseUrl}/api/company/approvals/messages/room-devops-main/${postedMsg.id}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': dir.data.token },
      body: JSON.stringify({ decision: 'approve' })
    });
    assert.strictEqual(dirMsgApprove.statusCode, 200);
    assert.strictEqual(JSON.parse(dirMsgApprove.body).status, 'deleted');

    // 4. Project delete RBAC: Employee blocked (403), Manager deletes own dept project (200)
    const empDelProj = await makeRequest(`${baseUrl}/api/company/projects/auction-chip-07`, {
      method: 'DELETE',
      headers: { 'X-Session-Token': empDevops.data.token }
    });
    assert.strictEqual(empDelProj.statusCode, 403);

    const mgrDelProj = await makeRequest(`${baseUrl}/api/company/projects/auction-chip-07`, {
      method: 'DELETE',
      headers: { 'X-Session-Token': mgrDevops.data.token }
    });
    assert.strictEqual(mgrDelProj.statusCode, 200);
  });

  it('should push realtime WebSocket RFC 6455 events strictly within RBAC scope and kick locked users instantly', async () => {
    resetCompanyWorkspaceForTests();
    const empDevops = await loginAs('nv.devops1');
    const empIt = await loginAs('nv.it1');
    const mgrDevops = await loginAs('ql.devops');
    const wsUrl = baseUrl.replace('http://', 'ws://') + '/ws/company';

    const openAuthWs = (token) => new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const received = [];
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      });
      ws.addEventListener('message', (ev) => {
        const parsed = JSON.parse(String(ev.data));
        received.push(parsed);
        if (parsed.type === 'auth_ok') {
          resolve({ ws, received });
        }
      });
      ws.addEventListener('error', reject);
    });

    const devopsConn = await openAuthWs(empDevops.data.token);
    const itConn = await openAuthWs(empIt.data.token);

    try {
      assert.strictEqual(devopsConn.received[0].protocol, 'RFC6455-WS');

      // Manager posts a message in DevOps room -> DevOps WS gets sync, IT WS gets NOTHING
      const syncPromise = new Promise((resolve) => {
        devopsConn.ws.addEventListener('message', (ev) => {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'sync' && msg.reason === 'room_message') resolve(msg);
        });
      });

      const postRes = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
        body: JSON.stringify({ text: 'Realtime WS test message' })
      });
      assert.strictEqual(postRes.statusCode, 200);

      const syncEvent = await Promise.race([
        syncPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('WS sync timeout')), 1500))
      ]);
      assert.strictEqual(syncEvent.roomId, 'room-devops-main');

      await new Promise(r => setTimeout(r, 80));
      assert.strictEqual(itConn.received.filter(m => m.type === 'sync').length, 0);

      // Manager locks nv.devops1 -> DevOps WS immediately receives session_revoked
      const kickPromise = new Promise((resolve) => {
        devopsConn.ws.addEventListener('message', (ev) => {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'session_revoked') resolve(msg);
        });
      });

      const lockRes = await makeRequest(`${baseUrl}/api/company/employees/u-emp-devops`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
        body: JSON.stringify({ active: false })
      });
      assert.strictEqual(lockRes.statusCode, 200);

      const kickEvent = await Promise.race([
        kickPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('WS kick timeout')), 1500))
      ]);
      assert.strictEqual(kickEvent.type, 'session_revoked');
    } finally {
      try { devopsConn.ws.close(); } catch {}
      try { itConn.ws.close(); } catch {}
    }
  });

  it('should enforce login brute-force throttling, session TTL expiry, header-only attachment auth, and strict company CORS', async () => {
    resetCompanyWorkspaceForTests();

    // 1. Brute-force guard returns 429 on 11th failed attempt
    for (let i = 0; i < 10; i++) {
      const failRes = await loginAs('nv.fin1', 'wrong-pwd');
      assert.strictEqual(failRes.status, 401);
    }
    const throttled = await makeRequest(`${baseUrl}/api/company/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nv.fin1', password: '123' })
    });
    assert.strictEqual(throttled.statusCode, 429);
    assert.ok(throttled.headers['retry-after']);

    // 2. Attachment rejects query-string ?token= and requires X-Session-Token header
    const emp = await loginAs('nv.devops1');
    const upRes = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': emp.data.token },
      body: JSON.stringify({
        text: 'File test',
        attachment: { name: 'note.txt', mimeType: 'text/plain', dataBase64: Buffer.from('SECRET').toString('base64') }
      })
    });
    const attId = JSON.parse(upRes.body).message.attachment.id;

    const queryTokenAtt = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/attachments/${attId}?token=${emp.data.token}`, {
      method: 'GET'
    });
    assert.strictEqual(queryTokenAtt.statusCode, 401);

    const headerTokenAtt = await makeRequest(`${baseUrl}/api/company/rooms/room-devops-main/attachments/${attId}`, {
      method: 'GET',
      headers: { 'X-Session-Token': emp.data.token }
    });
    assert.strictEqual(headerTokenAtt.statusCode, 200);
    assert.strictEqual(headerTokenAtt.body, 'SECRET');

    // 3. Strict CORS on /api/company/* rejects untrusted origin header echo
    const evilCors = await makeRequest(`${baseUrl}/api/company/state`, {
      method: 'GET',
      headers: { 'X-Session-Token': emp.data.token, Origin: 'https://evil.example' }
    });
    assert.strictEqual(evilCors.headers['access-control-allow-origin'], undefined);

    const localCors = await makeRequest(`${baseUrl}/api/company/state`, {
      method: 'GET',
      headers: { 'X-Session-Token': emp.data.token, Origin: 'http://localhost:3000' }
    });
    assert.strictEqual(localCors.headers['access-control-allow-origin'], 'http://localhost:3000');

    // 4. Expired session returns 401
    expireSessionForTests(emp.data.token);
    const expiredRes = await makeRequest(`${baseUrl}/api/company/state`, {
      method: 'GET',
      headers: { 'X-Session-Token': emp.data.token }
    });
    assert.strictEqual(expiredRes.statusCode, 401);
  });

  it('should execute real AES-256-GCM + PBKDF2 zero-knowledge RAM drop handover and burn on first read', async () => {
    const key = await generateSymmetricKey();
    const keyStr = await exportKeyToBase64Url(key);
    const secretPayload = JSON.stringify({ projectName: 'Gateway API', secretText: 'DB_PASS=UltraSecret#2026' });
    const encryptedBytes = await encryptPayload(secretPayload, key, { passphrase: 'pin-888', pad: true });
    const ciphertext = bufferToBase64Url(encryptedBytes);

    const createRes = await makeRequest(`${baseUrl}/api/lexicon/cache-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ciphertext, burnAfterReading: true, ttl: 300 })
    });
    assert.strictEqual(createRes.statusCode, 201);
    const dropId = JSON.parse(createRes.body).id;

    // First read succeeds and decrypts cleanly with imported key + PIN
    const read1 = await makeRequest(`${baseUrl}/api/lexicon/cache-entry/${dropId}`, { method: 'GET' });
    assert.strictEqual(read1.statusCode, 200);
    const importedKey = await importKeyFromBase64Url(keyStr);
    const cipherBytes = base64UrlToBuffer(JSON.parse(read1.body).ciphertext);
    const decrypted = await decryptPayload(cipherBytes, importedKey, { passphrase: 'pin-888' });
    assert.strictEqual(decrypted, secretPayload);

    // Second read returns 404 (burned from RAM)
    const read2 = await makeRequest(`${baseUrl}/api/lexicon/cache-entry/${dropId}`, { method: 'GET' });
    assert.strictEqual(read2.statusCode, 404);
  });

  it('should broadcast RBAC-scoped WebSocket online presence and persist project dueDate on create and delete', async () => {
    resetCompanyWorkspaceForTests();
    const empDevops = await loginAs('nv.devops1');
    const mgrDevops = await loginAs('ql.devops');
    const empIt = await loginAs('nv.it1');
    const dir = await loginAs('giamdoc');
    const wsUrl = baseUrl.replace('http://', 'ws://') + '/ws/company';

    const openAuthWs = (token) => new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const received = [];
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      });
      ws.addEventListener('message', (ev) => {
        const parsed = JSON.parse(String(ev.data));
        received.push(parsed);
        if (parsed.type === 'auth_ok') {
          resolve({ ws, received });
        }
      });
      ws.addEventListener('error', reject);
    });

    const empDevopsWs = await openAuthWs(empDevops.data.token);
    const mgrDevopsWs = await openAuthWs(mgrDevops.data.token);
    const empItWs = await openAuthWs(empIt.data.token);
    const dirWs = await openAuthWs(dir.data.token);

    try {
      await new Promise(r => setTimeout(r, 80));

      // Verify RBAC-scoped onlineCount via REST /api/company/state
      const devopsState = JSON.parse((await makeRequest(`${baseUrl}/api/company/state`, {
        method: 'GET',
        headers: { 'X-Session-Token': empDevops.data.token }
      })).body);
      const itState = JSON.parse((await makeRequest(`${baseUrl}/api/company/state`, {
        method: 'GET',
        headers: { 'X-Session-Token': empIt.data.token }
      })).body);
      const dirState = JSON.parse((await makeRequest(`${baseUrl}/api/company/state`, {
        method: 'GET',
        headers: { 'X-Session-Token': dir.data.token }
      })).body);

      assert.strictEqual(devopsState.onlineCount, 2);
      assert.strictEqual(itState.onlineCount, 1);
      assert.strictEqual(dirState.onlineCount, 4);

      // Closing mgrDevopsWs pushes realtime presence update (onlineCount === 1) to empDevopsWs
      const dropPresencePromise = new Promise((resolve) => {
        empDevopsWs.ws.addEventListener('message', (ev) => {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'presence' && msg.onlineCount === 1) resolve(msg);
        });
      });

      mgrDevopsWs.ws.close(1000, 'Done');
      const dropPresence = await Promise.race([
        dropPresencePromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('WS presence drop timeout')), 1500))
      ]);
      assert.strictEqual(dropPresence.onlineCount, 1);
      assert.deepStrictEqual(dropPresence.onlineUserIds, ['u-emp-devops']);

      // Standardized project creation with dueDate and zero auction countdown
      const createRes = await makeRequest(`${baseUrl}/api/company/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': mgrDevops.data.token },
        body: JSON.stringify({
          name: 'Triển khai CI/CD chuẩn v8.5',
          securityLevel: 'Ưu tiên Cao',
          dueDate: '2026-12-31',
          rawPriceXMR: 24,
          currency: 'Giờ',
          desc: 'Chuẩn hóa quy trình kiểm thử và đóng gói tự động.'
        })
      });
      assert.strictEqual(createRes.statusCode, 201);
      const createdProj = JSON.parse(createRes.body).project;
      assert.strictEqual(createdProj.dueDate, '2026-12-31');
      assert.strictEqual(createdProj.isAuction, false);
      assert.strictEqual(createdProj.auctionEndTime, 0);

      // Verify project is listed and can be revoked via DELETE /api/company/projects/:id
      const delRes = await makeRequest(`${baseUrl}/api/company/projects/${encodeURIComponent(createdProj.id)}`, {
        method: 'DELETE',
        headers: { 'X-Session-Token': mgrDevops.data.token }
      });
      assert.strictEqual(delRes.statusCode, 200);
    } finally {
      try { empDevopsWs.ws.close(); } catch {}
      try { mgrDevopsWs.ws.close(); } catch {}
      try { empItWs.ws.close(); } catch {}
      try { dirWs.ws.close(); } catch {}
    }
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
