import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// shortcut: local disk, lost on serverless redeploys; swap for 0G Storage (R14, lane C).
const DIR = path.join(process.cwd(), ".data", "assets");
const FILE = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

function extension(bytes: Buffer): keyof typeof TYPES {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return "png";
}

/** Saves generated image bytes and returns the URL the browser loads them from. */
export async function saveAsset(b64: string): Promise<string> {
  const bytes = Buffer.from(b64, "base64");
  const file = `${randomUUID()}.${extension(bytes)}`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, file), bytes);
  return `/api/assets/${file}`;
}

/** Reads a saved asset by its URL or file name. Null for anything that is not one of ours. */
export async function readAsset(
  urlOrFile: string,
): Promise<{ bytes: Buffer; type: string } | null> {
  const file = urlOrFile.split("/").pop() ?? "";
  const match = FILE.exec(file);
  if (!match) return null;
  try {
    return {
      bytes: await readFile(path.join(DIR, file)),
      type: TYPES[match[1] as keyof typeof TYPES],
    };
  } catch {
    return null;
  }
}
