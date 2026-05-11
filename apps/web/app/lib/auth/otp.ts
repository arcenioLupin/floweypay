import crypto from "crypto";

export const generateOtpCode = (): string => {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
};

function getOtpSecret(): string {
  const secret = process.env.AUTH_OTP_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MISSING_ENV_AUTH_OTP_SECRET");
    }
    console.warn(
      "[auth] WARNING: AUTH_OTP_SECRET is not set — using insecure dev fallback. Set AUTH_OTP_SECRET in production."
    );
    return "dev-secret-fallback";
  }

  return secret;
}

export const hashOtp = (email: string, code: string): string => {
  const secret = getOtpSecret();
  return crypto.createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
};
