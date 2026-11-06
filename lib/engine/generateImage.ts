import type { Asset, AssetKind, TickerEvent } from "@/lib/types";
import { env } from "@/lib/env";
import { zgCall } from "@/lib/zg";
import { fixtureManifest } from "@/fixtures/world";
import { saveAsset } from "./assets";

// 1280x720 fits seedream's pixel minimum and hy-image's area limit; sprites are square.
const SIZE: Record<AssetKind, string> = {
  street: "1280x720",
  interior: "1280x720",
  finale: "1280x720",
  sprite: "1024x1024",
};
// A flat background lets keySprite cut the character out in the browser.
const SPRITE_HINT =
  "Full-body character, centred, facing right, on one flat pure green (#00ff00) background, no shadow, no scenery.";

/** R3: every image prompt starts with the bible's art style. Throws ZgError on failure. */
export async function generateImage(
  id: string,
  kind: AssetKind,
  prompt: string,
  artStyle: string,
): Promise<{ asset: Asset; event: TickerEvent }> {
  const full = `${artStyle}. ${prompt}${kind === "sprite" ? `. ${SPRITE_HINT}` : ""}`;
  const { event, data } = await zgCall("image", { prompt: full, size: SIZE[kind] });
  const url = env.useFixtures
    ? (fixtureManifest.assets.find((a) => a.id === id)?.url ?? "/placeholder.svg")
    : await saveAsset(data!);
  const asset: Asset = {
    id,
    kind,
    url,
    model: event.model,
    requestId: event.requestId,
    status: "ready",
  };
  return { asset, event };
}
