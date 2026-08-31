import crypto from "crypto";

const ENCRYPTION_KEY =
  process.env.SESSION_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "emmatech-default-secure-gateway-key-32b";

// Derive 32 byte key for aes-256-cbc / gcm
function getKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

export function encryptCredentials(plainData: Record<string, string>): string {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv);
    let encrypted = cipher.update(JSON.stringify(plainData), "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (err) {
    console.error("Encryption error:", err);
    throw new Error("Failed to secure credentials");
  }
}

export function decryptCredentials(encryptedData: string): Record<string, string> {
  try {
    if (!encryptedData || !encryptedData.includes(":")) return {};
    const [ivHex, encryptedHex] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (err) {
    console.error("Decryption error:", err);
    return {};
  }
}
