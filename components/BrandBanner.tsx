import Image from "next/image";

/** Shared ETH Jasoos banner (carries the wordmark) for auth and landing headers. */
export function BrandBanner({ className }: { className?: string }) {
  return (
    <h1 className={className}>
      <Image
        src="/jasoos-banner.png"
        alt="ETH Jasoos"
        width={2172}
        height={724}
        priority
        className="h-auto w-full rounded-base border-2 border-border shadow-shadow"
      />
    </h1>
  );
}
