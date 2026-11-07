import fs from 'fs';

let html = fs.readFileSync('public/vault.html', 'utf8');
const lineEnd = html.includes('\r\n') ? '\r\n' : '\n';

html = html.replace(
  '<!-- STEALTH ANONYMOUS BAZAAR CONSOLE (RAM-ONLY & ZERO-LOG)            -->',
  '<!-- STEALTH ANONYMOUS BAZAAR CONSOLE (ZERO-KNOWLEDGE EPHEMERAL VAULT) -->'
);

const targetBlock = [
  '          <div>',
  '            <div class="vault-title-row">',
  '              <h1 class="vault-title">GHOST BAZAAR </h1>',
  '              <span class="vault-version-pill">RAM-VOLATILE v3.2</span>',
  '            </div>',
  '            <p class="vault-subtitle">ZERO-KNOWLEDGE EPHEMERAL VAULT • Zero-Log IP • 100% RAM Khả Biến • Mã Hóa AES-256-GCM • Tự Hủy Khi Thoát</p>',
  '          </div>'
].join(lineEnd);

const replacementBlock = [
  '          <div>',
  '            <div class="vault-title-row">',
  '              <h1 class="vault-title">GHOST BAZAAR</h1>',
  '            </div>',
  '          </div>'
].join(lineEnd);

if (!html.includes(targetBlock)) {
  console.error('Target block not found!');
  process.exit(1);
}

html = html.replace(targetBlock, replacementBlock);
fs.writeFileSync('public/vault.html', html, 'utf8');
console.log('Successfully updated header brand in public/vault.html');

