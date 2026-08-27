import type { PbsPasswordPublicKeyResponse } from "../../../../packages/contracts/pbs-auth.js";

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const base64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");

  if (!base64) {
    throw new Error("Invalid password encryption key.");
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return globalThis.btoa(binary);
};

export const encryptPasswordForLogin = async (
  password: string,
  key: PbsPasswordPublicKeyResponse,
): Promise<string> => {
  if (key.algorithm !== "RSA-OAEP-256") {
    throw new Error("Unsupported password encryption algorithm.");
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error("Password encryption is not available in this browser.");
  }

  const publicKey = await globalThis.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(key.publicKeyPem),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );
  const encryptedPassword = await globalThis.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    new TextEncoder().encode(password),
  );

  return arrayBufferToBase64(encryptedPassword);
};
