import { fileURLToPath } from "node:url";
import path from "node:path";

/** Check production configuration without printing secret values or calling external services.
 * @param {Record<string, string | undefined>} env
 */
export function checkDeploymentEnvironment(env) {
  const issues = [];
  for (const key of ["ZG_COMPUTE_API_KEY", "SESSION_SECRET", "WORLD_APP_ID", "WORLD_RP_ID", "WORLD_RP_SIGNING_KEY", "ARKIV_SIGNER_KEY", "ASSET_DIR"]) {
    if (!env[key]?.trim()) issues.push(`${key} is required.`);
  }
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) issues.push("SESSION_SECRET must be at least 32 characters; preserve the existing production value.");
  if (env.WORLD_ENVIRONMENT !== "production") issues.push("WORLD_ENVIRONMENT must be production for real World App users.");
  if (env.ARKIV_SIGNER_KEY && !/^0x[0-9a-f]{64}$/i.test(env.ARKIV_SIGNER_KEY)) issues.push("ARKIV_SIGNER_KEY must be a 32-byte hex private key.");
  if (env.ASSET_DIR && !path.isAbsolute(env.ASSET_DIR)) issues.push("ASSET_DIR must be an absolute path on the persistent volume.");
  const quota = Number(env.FREE_GAME_LIMIT ?? 0);
  if (!Number.isInteger(quota) || quota < 0 || (quota === 0 && !env.UNLIMITED_PLAYERS?.trim())) issues.push("Set a positive FREE_GAME_LIMIT, or explicitly configure UNLIMITED_PLAYERS for the demo.");
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(process.env.DEPLOY_ENV_FILE || ".env.local"); } catch { /* Hosting env may be injected directly. */ }
  const issues = checkDeploymentEnvironment(process.env);
  for (const issue of issues) console.error(`FAIL: ${issue}`);
  if (issues.length) process.exitCode = 1;
  else console.log("Configuration checks passed. Still verify signer funding, persistent-volume retention, one-instance hosting and a full live case; no external services were tested.");
}
