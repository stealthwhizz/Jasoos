# Why Arkiv

## What Arkiv gives us that a database would not

- **A public gallery with no API of ours.** The gallery page queries Arkiv from the visitor's
  browser. Any other app, bot, or judge can run the same query
  ([scripts/arkiv-query.ts](../scripts/arkiv-query.ts), no keys needed) and get the same list,
  sorted by the node. With a database, the gallery would only exist behind our server.
- **Expiry instead of cron jobs.** Three product rules are just lifetimes:
  - the **daily limit** is the live count of 24-hour `creation` entities;
  - **"how busy is this case"** is the live count of 1-hour `visit` entities;
  - **cold cases**: a world lives 7 days and each play extends it, so abandoned cases leave the
    gallery on their own.

  A database would need a scheduler, a cleanup job, and counters that can drift. We have none.

- **Rules other people can check.** "One accusation per person per case" and "three creations per
  person per day" are enforced against public entities. Anyone can count them and see that the
  app followed its own rules.
- **Provenance that outlives us.** A case file stays readable on chain even if our server goes
  down. Expired entities leave the live set but remain in transaction history.

## What breaks without it

- The gallery would need our database and our API, and no other app could list our worlds.
- The daily limit, activity counts, and cold-case fading would each need a scheduled job.
- The fairness rules (limits, one accusation) would be claims only we could check.

## What stays off Arkiv, and why

| Kept off chain                     | Why                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Image bytes                        | Entities hold up to 128 KiB of bytes; images are stored elsewhere and referenced by URL |
| The mystery's answer, in the clear | Everything on chain is public. It is sealed (AES-256-GCM); only our server opens it     |
| World ID proofs, nullifiers        | Only a salted hash (`humanHash`) goes on chain. Nothing links it to a person            |
| Names, prompts, wallets of players | Expired entities still sit in transaction history, so no personal data is written       |
| Moderation and model calls         | They run on 0G; Arkiv stores the result, not the process                                |
