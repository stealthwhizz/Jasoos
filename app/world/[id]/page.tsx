import { notFound } from "next/navigation";
import { getWorld, toPublicManifest } from "@/lib/arkiv";
import { WorldView } from "./WorldView";

export default async function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const world = await getWorld((await params).id);
  if (!world) notFound();
  return <WorldView manifest={toPublicManifest(world)} />;
}
