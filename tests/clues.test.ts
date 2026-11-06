import { describe, expect, it } from "vitest";
import { CODEBOOK } from "@/lib/engine/codebook";
import { decodeNote } from "@/lib/engine/codec";
import type { GameBible, RoomPlan } from "@/lib/universe";
import { plantClues } from "@/lib/world-engine";

// A note with plenty of codebook words, so it can carry the code.
const longNote = CODEBOOK.slice(0, 20)
  .map(([w]) => `the ${w} one`)
  .join(", ");

const room = (name: string, note?: string): RoomPlan =>
  ({ name, object: { name: `${name} box`, description: "Up close.", note } }) as RoomPlan;

const bible = (evidenceRoom: number | undefined, notes: Array<string | undefined>) =>
  ({
    evidenceRoom,
    rooms: notes.map((n, i) => room(`Room ${i + 1}`, n)),
    npcs: [{ name: "Meera" }, { name: "Dev" }, { name: "Asha" }],
  }) as unknown as Pick<GameBible, "rooms" | "npcs" | "evidenceRoom">;

describe("plantClues", () => {
  it("hides the culprit's code in an innocent room, decodable only with the sealed key", () => {
    const b = bible(2, [longNote, longNote, longNote]);
    const { evidenceRoom, key, evidenceNote } = plantClues(b, 0);

    expect(evidenceRoom).toBe(1);
    expect(b.rooms[1]!.object!.note).toBeUndefined();
    expect(evidenceNote).toBeUndefined();
    // Culprit Meera is in room 0, so the note goes to room 2 and room 0 holds the decoy.
    expect(decodeNote(b.rooms[2]!.object!.note!, key)).toMatchObject({ hidden: true, secret: "MEE" });
    expect(decodeNote(b.rooms[0]!.object!.note!, key).hidden).toBe(false);
    expect(key).not.toBe("AAA");
  });

  it("falls back to a strongbox in room 1 when the planner picks no valid evidence room", () => {
    const b = bible(7, [longNote, longNote, longNote]);
    const { evidenceRoom } = plantClues(b, 1);
    expect(evidenceRoom).toBe(0);
    expect(b.rooms[0]!.object).toEqual({
      name: "A locked strongbox",
      description: expect.any(String),
    });
  });

  it("puts the code in the evidence box when no note can carry it", () => {
    const b = bible(1, [undefined, "Too short.", "Also short."]);
    const { evidenceNote } = plantClues(b, 2);
    expect(evidenceNote).toBe("Initials scratched inside: A-S-A");
  });
});
