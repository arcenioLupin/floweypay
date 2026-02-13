import crypto from "crypto";

export const SESSION_TTL_DAYS = 30;

export const generateSessionToken = () => {
  // 32 bytes -> base64url (token largo, seguro)
  return crypto.randomBytes(32).toString("base64url");
};

export const hashSessionToken = (token: string) => {
  // hash reproducible para guardar en DB (no guardes el token en claro)
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const sessionExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TTL_DAYS);
  return d;
};
