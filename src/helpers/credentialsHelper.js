const crypto = require('crypto');

function key() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured');
  return crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
}
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}
function decrypt(value) {
  if (!value || !value.iv || !value.tag || !value.data) return value; // supports existing plaintext records
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8'));
}
module.exports = { encrypt, decrypt };
