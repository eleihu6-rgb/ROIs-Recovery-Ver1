// RSA (PKCS#1 v1.5) password encryption for the ROIS portal login, using the
// same jsencrypt 3.3.2 the login WebView loads — bundled here instead of fetched
// from a CDN at runtime. Its CommonJS build exports the constructor itself while
// the ESM build (Metro's `browser` field) exports it as `default`/`JSEncrypt`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require('jsencrypt');

interface JSEncryptLike {
  setPublicKey(key: string): void;
  encrypt(plain: string): string | false;
}
const JSEncrypt: new () => JSEncryptLike = mod.JSEncrypt ?? mod.default ?? mod;

export function rsaEncrypt(publicKey: string, plain: string): string {
  const enc = new JSEncrypt();
  enc.setPublicKey(publicKey);
  const out = enc.encrypt(plain);
  if (!out) throw new Error('Could not encrypt the password for the portal.');
  return out;
}
