import {
  constants,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  type KeyObject,
} from "node:crypto";
import { env, isProdLikeEnv } from "../../config/index.js";
import type {
  PbsLoginRequest,
  PbsPasswordPublicKeyResponse,
} from "../../../../packages/contracts/pbs-auth.js";

const PASSWORD_ENCRYPTION_ALGORITHM = "RSA-OAEP-256";
const DEV_KEY_ID = "pbs-dev-ephemeral";
const MAX_ENCRYPTED_PASSWORD_BASE64_LENGTH = 1024;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class PasswordDecryptionError extends Error {
  constructor() {
    super("Invalid encrypted login request.");
    this.name = "PasswordDecryptionError";
  }
}

const normalizePem = (value: string): string => value.trim().replace(/\\n/g, "\n");

const loadPrivateKey = (): KeyObject => {
  const configuredPrivateKey = env.PBS_AUTH_RSA_PRIVATE_KEY?.trim();

  if (configuredPrivateKey) {
    return createPrivateKey(normalizePem(configuredPrivateKey));
  }

  if (isProdLikeEnv) {
    throw new Error("PBS_AUTH_RSA_PRIVATE_KEY is required in production-like environments.");
  }

  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  }).privateKey;
};

const passwordPrivateKey = loadPrivateKey();
const passwordPublicKeyPem = String(
  createPublicKey(passwordPrivateKey).export({
    format: "pem",
    type: "spki",
  }),
);
const passwordKeyId = env.PBS_AUTH_RSA_KEY_ID?.trim() || DEV_KEY_ID;

const isValidBase64 = (value: string): boolean => {
  if (
    value.length === 0
    || value.length > MAX_ENCRYPTED_PASSWORD_BASE64_LENGTH
    || value.length % 4 !== 0
  ) {
    return false;
  }

  return BASE64_PATTERN.test(value);
};

export const getPasswordPublicKey = (): PbsPasswordPublicKeyResponse => ({
  keyId: passwordKeyId,
  algorithm: PASSWORD_ENCRYPTION_ALGORITHM,
  publicKeyPem: passwordPublicKeyPem,
});

export const decryptLoginPassword = (payload: PbsLoginRequest): string => {
  if (
    payload.encryption.algorithm !== PASSWORD_ENCRYPTION_ALGORITHM
    || payload.encryption.keyId !== passwordKeyId
    || !isValidBase64(payload.encryptedPassword)
  ) {
    throw new PasswordDecryptionError();
  }

  try {
    const decrypted = privateDecrypt(
      {
        key: passwordPrivateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(payload.encryptedPassword, "base64"),
    ).toString("utf8");

    if (!decrypted) {
      throw new PasswordDecryptionError();
    }

    return decrypted;
  } catch {
    throw new PasswordDecryptionError();
  }
};
