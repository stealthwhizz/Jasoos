import { Gallery } from "@/components/Gallery";

export default function GalleryPage() {
  return (
    <div className="space-y-8 pt-10">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Live cases</h1>
        <p className="text-neutral-500">Worlds fade from here unless people keep playing them.</p>
      </div>
      <Gallery />
    </div>
  );
}
