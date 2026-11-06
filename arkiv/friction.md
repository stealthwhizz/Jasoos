# Arkiv friction log

Honest notes from building ETHJasoos on rabdi with `@arkiv-network/sdk` 1.0.1, Node 20.19.
Dated entries, newest decisions marked with what we did about each.

## Current implementation note

The dated observations below include the removed prototype. The current stack uses
`game`, `scene`, `screen`, `unlock`, and `accusation`, all with a 90-day lifetime;
no visit batching, daily creation quota, or extend-on-play code remains.
See [schema.md](schema.md) for the current contract.

- **2026-11-06:** Asking for `.limit(200)` fails with node maximum 100. The store now
  reads all pages in batches of 100, including before deleting saved scenes.
  *Expected:* the SDK to page for us, or a typed limit. *Happened:* the whole gallery query
  failed at runtime ("limit 200 exceeds the node maximum of 100. Page through the results with
  an offset instead"), so the home page showed "Failed to list games". The message itself was
  excellent: it told us the fix. *Ask:* export `MAX_LIMIT` as the type of `.limit()`, or add a
  `fetchAll()` that pages with `$key` for you. *Reproduce:* `select().where(…).limit(200).fetch()`.
- **2026-11-07. We leaked the answer through a public attribute.** Our `accusation` stored the
  guessed suspect and `correct` in the clear, so selecting `correct = true` gave away every
  case's culprit. We now store the guess sealed (`sealedAccused`). Nothing in the SDK was wrong,
  but nothing warned us either. *Ask:* a short "every attribute is public; here is how to seal
  one" section next to the schema docs, with an example.
- **2026-11-07. Optional columns made the schema change painless.** Adding `sealedAccused` as
  `str().optional()` and making the old `accused` optional let one query read both old and new
  records, and schema mismatch rows were reported as `skipped` instead of failing the read.
- **2026-11-06. Reads sometimes stall inside our server.** The same `game` listing that a
  plain Node script answers in about 0.5 s occasionally took 20 s to 3 min inside the Next.js
  server (0% CPU, waiting on the request), then went back to 0.4 s. We did not find the cause.
  *Ask:* a recommended HTTP timeout and retry setting for `rabdi()` transports, and a status
  page we can check when reads slow down.
- **2026-11-06. `bigint` everywhere is right, but bites in logs.** `count()` and `u64` values
  are `bigint`, so `JSON.stringify` on a query result throws "Do not know how to serialize a
  BigInt". *Ask:* a `toJSON`-friendly helper, or a note in the query docs.

## Setup

- **2026-11-06. The faucet cannot fund a server wallet.** The faucet only pays the wallet you
  connect in the browser. Our signer is a key generated on the server, so it can't connect. We
  first claimed to a MetaMask wallet, which also failed (0 balance, no clear error), and ended up
  using a separate funded test wallet as the signer. **Ask:** let the faucet take a pasted
  address, or document "claim, then transfer" up front.
- **2026-11-06. Pasted the address instead of the private key.** `ARKIV_SIGNER_KEY` held a
  42-character address; viem's error was "invalid private key, expected hex or 32 bytes, got
  string". Our fault, but a length check in the SDK ("looks like an address, not a key") would
  have saved a round trip.
- **2026-11-06. Access keys: clear, and good warning.** Without `accessKey`, the SDK prints that
  the public endpoint is heavily rate limited. Getting a key at the hub took a minute. The SDK
  doc saying the key is not a secret, and should be origin-restricted, answered our question about
  shipping it to browsers.
- The SDK README asks for Node 22.10+. We ran on Node 20.19 with no problems so far.

## Writes

- **About 6–7 s per write** (resolves after block inclusion). Fine for publishing a world; too slow
  to block page load on, so the world page sends its `visit` without waiting for it.
- **One signer, parallel writes.** viem fetches the nonce per send, so concurrent `createEntity`
  calls from one account can collide. We put all writes through a one-at-a-time queue.
- **`executeBatch` is excellent.** World + creation in one transaction cut publish from two writes
  (~14 s) to one (~6 s) and made it all-or-nothing. **Gap:** created keys are only known after
  the transaction, so one create in a batch cannot reference another's key. We added our own
  `publishId` attribute to link them.
- **Size limits shaped the schema.** Strings hold 128 bytes, so titles are cut and longer text goes
  into `bytes`. All `bytes` in one entity share 128 KiB, so the manifest is gzipped, and gallery
  cards read a small `summary` column instead of the manifest.

## Queries (sorting, counting)

- **Sorting works on the node.** `orderBy(desc("createdAt"))` on an indexed `u64` gave newest
  first across all pages. This answered an open question in our plan; no sorting in the app.
- **`$createdAt` cannot be sorted on**, so we store our own `createdAt` attribute. Worth stating
  next to the list of sortable system fields.
- **`count()` is exactly what a quota needs.** It returns a `bigint`; remember to compare with `0n`.
- **Typed schemas caught mistakes at compile time** (filtering on a non-indexed column, wrong value
  types). The flat, typed rows from `select().from(Schema)` are pleasant to use.

## Expiry (extending, history)

- **`$expiresAt` is a block number, not a time.** To tell a player "your next slot opens in about 3
  hours" we convert blocks to time using the average block time of the last 1000 blocks (about 2 s
  on rabdi). A helper like `estimateTime(block)` in the SDK would help every app with a quota.
- **`extendEntity` works**, and fits in the same batch as a create, so "extend on play" costs no
  extra transaction.
- **Expired is not deleted.** Entities leave the live set but stay in transaction history, so we
  never write personal data and seal anything secret before it goes on chain.

## Docs and SDK

- The README walkthrough (schema → create → query) got us from zero to a working write in minutes.
- `getEntity` on an expired or missing key throws a clear message ("No live entity with key …").
  We map that to a 404 "case not found or gone cold".
- **Wish list:** block → time helper; faucet that takes an address; an example of one batch item
  referencing another; a short "everything here is public" note near the bytes docs, for apps
  storing anything sensitive.
