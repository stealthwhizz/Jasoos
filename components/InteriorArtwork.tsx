"use client";

import { useState } from "react";
import type { Asset } from "@/lib/types";

/** Generation failures and image-download failures are distinct; neither blocks an interview. */
export function InteriorArtwork({ asset, description }: { asset?: Asset; description: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (!asset || asset.status === "pending") {
    return (
      <div
        role="status"
        className="flex min-h-56 items-center justify-center bg-neutral-100 p-6 text-center"
      >
        <div>
          <p className="font-medium">Still building this room</p>
          <p className="mt-1 text-sm text-neutral-500">
            The interior is generating. You can keep talking while it finishes.
          </p>
        </div>
      </div>
    );
  }
  if (asset.status === "failed" || imageFailed || !asset.url) {
    return (
      <div role="status" className="border-b border-amber-200 bg-amber-50 p-5">
        <p className="font-medium">
          {asset.status === "failed"
            ? "This room image could not be generated."
            : "The room artwork could not be loaded."}
        </p>
        <p className="mt-1 break-words text-sm text-neutral-600">
          The case is still playable. Generation record: {asset.model} · {asset.requestId}
        </p>
        {asset.status === "ready" && asset.url && (
          <button
            type="button"
            className="case-button secondary mt-3"
            onClick={() => setImageFailed(false)}
          >
            Retry room image
          </button>
        )}
      </div>
    );
  }
  return (
    <figure>
      <img
        src={asset.url}
        alt={description}
        onError={() => setImageFailed(true)}
        className="w-full rounded-xl"
      />
      <figcaption className="mt-1 font-mono text-xs text-neutral-400">
        {asset.model} · {asset.requestId}
      </figcaption>
    </figure>
  );
}
