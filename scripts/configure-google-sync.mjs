import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';

// Public configuration only. A Chrome-extension OAuth client has no client secret.
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const configPath = path.resolve(option('--config') || 'config/google-sync.json');
const manifestPath = path.resolve(option('--manifest') || 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
function extensionId(publicKey) {
  const raw = Buffer.from(publicKey, 'base64');
  createPublicKey({ key: raw, format: 'der', type: 'spki' });
  return [...createHash('sha256').update(raw).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
function atomicWrite(file, data) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, file);
}
if (args.includes('--prepare')) {
  if (!config.publicKey) {
    // Reuse an established identity whenever available; never regenerate on rerun.
    config.publicKey = manifest.key || generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  }
  config.extensionId = extensionId(config.publicKey);
  config.clientId ||= '';
  atomicWrite(configPath, config);
}
if (args.includes('--apply')) {
  const clientId = option('--client-id') || config.clientId;
  if (!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId || '')) throw Error('Provide a Google OAuth Chrome Extension Client ID with --client-id (not a secret).');
  if (!config.publicKey) throw Error('Run --prepare first.');
  const id = extensionId(config.publicKey);
  if (config.extensionId && config.extensionId !== id) throw Error('Public key and extension ID do not match.');
  if (manifest.key !== config.publicKey && !args.includes('--confirm-backup')) throw Error('Changing extension ID creates a different local storage namespace. Export every TODO workspace first, then pass --confirm-backup.');
  const result = { ...manifest, key: config.publicKey, oauth2: { client_id: clientId, scopes: ['https://www.googleapis.com/auth/drive.appdata'] } };
  config = { publicKey: config.publicKey, extensionId: id, clientId };
  atomicWrite(configPath, config);
  atomicWrite(manifestPath, result);
}
if (!config.publicKey) {
  console.log('Run: node scripts/configure-google-sync.mjs --prepare');
} else {
  console.log(JSON.stringify({ extensionId: extensionId(config.publicKey), clientConfigured: !!config.clientId, manifestConfigured: !!JSON.parse(fs.readFileSync(manifestPath, 'utf8')).oauth2, configPath }, null, 2));
  if (!args.includes('--apply')) console.log('Manifest identity is unchanged. Create a Google OAuth Chrome Extension client for this extensionId, then apply with --client-id and --confirm-backup after exporting TODOs.');
}
