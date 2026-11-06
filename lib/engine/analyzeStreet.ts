import type { Asset, Door, Location, TickerEvent, WalkMap } from "@/lib/types";
import { env } from "@/lib/env";
import { ZgError, parseJson, zgCall } from "@/lib/zg";
import { fixtureManifest } from "@/fixtures/world";
import { readAsset } from "./assets";
import { fallbackMap, parseVisionMap } from "./walkMap";

export interface StreetMap {
  walkMap: WalkMap;
  doors: Door[];
  events: TickerEvent[];
  /** True when the vision result was unusable and the PRD fallback map is in use. */
  fallback: boolean;
}

const system = (locations: Location[]) => `You map a side-on street image for a walking game.
Coordinates are fractions of the image width and height, 0 to 1, origin top-left.
Reply only with JSON: {"walkable": [[[x, y], ...], ...], "doors": [{"locationId": "", "x": 0, "y": 0, "w": 0, "h": 0}]}
"walkable": polygons of ground a person can stand on (pavement, road, square).
"doors": one rectangle per building door, for these buildings from left to right:
${locations.map((l) => `- locationId "${l.id}": ${l.name}`).join("\n")}`;

/** R4: vision pass on the street image, retried once, then the fallback map. */
export async function analyzeStreet(street: Asset, locations: Location[]): Promise<StreetMap> {
  const ids = locations.map((l) => l.id);
  const fallback = (events: TickerEvent[]): StreetMap => ({
    ...fallbackMap(ids),
    events,
    fallback: true,
  });
  const image = env.useFixtures ? null : await readAsset(street.url);
  if (!env.useFixtures && !image) return fallback([]);

  const events: TickerEvent[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { event, data } = await zgCall("vision", {
        messages: [
          { role: "system", content: system(locations) },
          {
            role: "user",
            content: image
              ? [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${image.type};base64,${image.bytes.toString("base64")}`,
                    },
                  },
                ]
              : street.url,
          },
        ],
        json: true,
        maxTokens: 1500,
      });
      events.push(event);
      if (env.useFixtures) {
        const { walkMap, doors } = fixtureManifest;
        return { walkMap, doors, events, fallback: false };
      }
      const map = parseVisionMap(parseJson(data), ids);
      if (map) return { ...map, events, fallback: false };
    } catch (err) {
      if (!(err instanceof ZgError)) throw err;
      events.push(err.event);
    }
  }
  return fallback(events);
}
