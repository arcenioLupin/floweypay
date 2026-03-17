export function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`MISSING_ENV_${name}`);
  return v;
}

export function basicAuth(user: string, pass: string) {
  return Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
}
