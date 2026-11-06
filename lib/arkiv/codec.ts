import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Manifest, WorldBible } from "@/lib/types";

/** Packs what goes on chain: a gzipped public manifest and a sealed mystery. */

type Mystery = WorldBible["mystery"];

export function packManifest(m: Manifest): Uint8Array {
  const { mystery, ...bible } = m.bible;
  void mystery;
  return gzipSync(JSON.stringify({ ...m, bible }));
}

export function unpackManifest(bytes: Uint8Array, mystery: Mystery, worldKey: string): Manifest {
  const pub = JSON.parse(gunzipSync(bytes).toString("utf8")) as Omit<Manifest, "bible"> & {
    bible: Omit<WorldBible, "mystery">;
  };
  return { ...pub, worldId: worldKey, bible: { ...pub.bible, mystery } };
}

/** The sealing key is derived from a server secret, so only this server can read the answer. */
function key(secret: string): Buffer {
  if (!secret) throw new Error("No sealing secret: set ARKIV_SIGNER_KEY or MYSTERY_SEAL_KEY.");
  return createHash("sha256").update(`ethjasoos:mystery:${secret}`).digest();
}

/** AES-256-GCM. Layout: 12-byte IV, 16-byte tag, ciphertext. */
export function sealMystery(mystery: Mystery, secret: string): Uint8Array {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(mystery), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function openMystery(sealed: Uint8Array, secret: string): Mystery {
  const buf = Buffer.from(sealed);
  const decipher = createDecipheriv("aes-256-gcm", key(secret), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as Mystery;
}

/** Arkiv strings hold at most 128 bytes. Cuts on a character boundary. */
export function fitString(text: string, maxBytes = 128): string {
  let out = text;
  while (Buffer.byteLength(out, "utf8") > maxBytes) out = out.slice(0, -1);
  return out;
}
