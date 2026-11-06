import { expect, it, vi } from "vitest";
import { TimeoutError } from "viem";
import { isTransientError, withRetry } from "@/lib/retry";
import { ARKIV_TIMEOUT_MS, RETRY_MAX } from "@/lib/constants";

it("treats an Arkiv RPC timeout as transient, so withRetry retries it", async () => {
  const timeout = new TimeoutError({ body: {}, url: "https://rpc.example" });
  expect(isTransientError(timeout)).toBe(true);
  const fn = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValue("ok");
  await expect(withRetry(fn, { retries: RETRY_MAX, baseMs: 1 })).resolves.toBe("ok");
  expect(fn).toHaveBeenCalledTimes(2);
});

it("bounds a dead Arkiv node to (RETRY_MAX + 1) attempts of ARKIV_TIMEOUT_MS each", () => {
  // The viem transport itself no longer retries (retryCount: 0), so this is the whole budget.
  expect((RETRY_MAX + 1) * ARKIV_TIMEOUT_MS).toBeLessThanOrEqual(40_000);
});
