import crypto from "crypto";

export const generateOtpCode = (): string => {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
};

export const hashOtp = (email: string, code: string): string => {
  const secret = process.env.AUTH_OTP_SECRET ?? "dev-secret-change-me";
  return crypto.createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
};
