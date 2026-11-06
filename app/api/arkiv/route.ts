import { env } from "@/lib/env";

/**
 * What a browser needs to query Arkiv itself: the project to filter on and the RPC access key.
 * The access key is not a secret (Arkiv ships it to browsers by design; restrict it to your
 * origins in the Arkiv hub). The signer key never leaves the server.
 */
export async function GET() {
  return Response.json({
    mode: env.arkiv.live ? "arkiv" : "memory",
    project: env.projectId,
    accessKey: env.arkiv.accessKey,
  });
}
