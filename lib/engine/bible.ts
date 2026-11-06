import type { Location, WorldBible } from "@/lib/types";

const MAX_TEXT = 600;

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXT) : null;
const slug = (v: unknown): string | null => {
  const s = text(v)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || null;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

function location(raw: unknown): Location | null {
  const l = obj(raw);
  const n = obj(l.npc);
  const [id, name, interiorDescription] = [slug(l.id), text(l.name), text(l.interiorDescription)];
  const [npcId, npcName, persona, clue] = [slug(n.id), text(n.name), text(n.persona), text(n.clue)];
  if (!id || !name || !interiorDescription || !npcId || !npcName || !persona || !clue) return null;
  return { id, name, interiorDescription, npc: { id: npcId, name: npcName, persona, clue } };
}

/** Validates the plan model's JSON against the bible schema (R2). Null means "retry". */
export function parseBible(raw: unknown): WorldBible | null {
  const b = obj(raw);
  const m = obj(b.mystery);
  const fields = {
    title: text(b.title),
    premise: text(b.premise),
    artStyle: text(b.artStyle),
    streetDescription: text(b.streetDescription),
    protagonist: text(b.protagonist),
  };
  if (Object.values(fields).some((v) => !v)) return null;

  if (!Array.isArray(b.locations) || b.locations.length !== 3) return null;
  const locations = b.locations.map(location);
  if (locations.some((l) => !l)) return null;
  const ok = locations as [Location, Location, Location];
  if (new Set(ok.map((l) => l.id)).size !== 3 || new Set(ok.map((l) => l.npc.id)).size !== 3) {
    return null;
  }

  const [secret, finalePrompt, culpritNpcId] = [
    text(m.secret),
    text(m.finalePrompt),
    slug(m.culpritNpcId),
  ];
  if (!secret || !finalePrompt || !ok.some((l) => l.npc.id === culpritNpcId)) return null;

  return {
    ...(fields as Record<keyof typeof fields, string>),
    locations: ok,
    mystery: { secret, finalePrompt, culpritNpcId: culpritNpcId! },
  };
}
