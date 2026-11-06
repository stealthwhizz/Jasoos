try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

/** Returns the named env vars, or prints which are missing and exits cleanly. */
export function requireEnv<K extends string>(script: string, names: K[]): Record<K, string> {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.log(`${script}: skipped. Set ${missing.join(", ")} in .env.local (see .env.example).`);
    process.exit(0);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n]!])) as Record<K, string>;
}

export async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, Math.round(performance.now() - start)];
}
