import type { Asset, AssetKind, TickerEvent } from "@/lib/types";
import { zgCall } from "@/lib/zg";
import { fixtureManifest } from "@/fixtures/world";

/** R3: every image prompt starts with the bible's art style. */
export async function generateImage(
  id: string,
  kind: AssetKind,
  prompt: string,
  artStyle: string,
): Promise<{ asset: Asset; event: TickerEvent }> {
  const { event } = await zgCall("image", { kind, prompt: `${artStyle}. ${prompt}` });
  // TODO(A): store real bytes (0G Storage is C's helper) and set url/storageRoot from them.
  // TODO(A): sprite — ask for a flat background, key it out, trim, flip for left/right.
  const url = fixtureManifest.assets.find((a) => a.id === id)?.url ?? "/fixtures/street.svg";
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
