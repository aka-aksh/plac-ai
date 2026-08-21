import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error("ENCRYPTION_KEY is missing");
  }

  let decoded: Buffer;

  try {
    decoded = Buffer.from(key, "base64");
  } catch {
    throw new Error("ENCRYPTION_KEY is not valid base64");
  }

  if (decoded.length !== KEY_LENGTH) {
    throw new Error(
      "ENCRYPTION_KEY must decode to exactly 32 bytes"
    );
  }

  return decoded;
}

export function encryptSecret(secret: string) {
  const key = getEncryptionKey();

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(
  encryptedBase64: string,
  ivBase64: string,
  authTagBase64: string
): string {
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivBase64, "base64")
  );

  decipher.setAuthTag(
    Buffer.from(authTagBase64, "base64")
  );

  const decrypted = Buffer.concat([
    decipher.update(
      Buffer.from(encryptedBase64, "base64")
    ),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}