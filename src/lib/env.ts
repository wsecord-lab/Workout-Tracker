/**
 * Server-side environment variable validation.
 * Import this from server code only. Fails fast with clear errors if required vars are missing.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to .env (see .env.example).`
    );
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === "" ? undefined : value;
}

export type Env = {
  DATABASE_URL: string;
  ACCESS_TOKEN: string | undefined;
  NODE_ENV: string;
};

let cached: Env | null = null;

/**
 * Get validated environment variables. Throws if required vars are missing.
 * Call from server code only (layout, actions, route handlers).
 */
export function getEnv(): Env {
  if (cached) return cached;

  const DATABASE_URL = requireEnv("DATABASE_URL");
  const ACCESS_TOKEN = optionalEnv("ACCESS_TOKEN");
  const NODE_ENV = process.env.NODE_ENV ?? "development";

  cached = { DATABASE_URL, ACCESS_TOKEN, NODE_ENV };
  return cached;
}
