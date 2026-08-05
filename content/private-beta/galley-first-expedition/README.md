# SPOILER WORKTREE — One True Night Watch

Everything in this directory is **private beta-draft material**. It is not
alpha canon, not an episode commitment, and not an activated content epoch.
Sentyr (`@alteron808`) remains the sole story authority. The pack deliberately
separates finite mechanical facts from questions whose answers would become
lore.

This is a compact content-production specimen, not a bulk lore import. It takes
only reusable shapes from the Neocadia research and the existing Dregg Descent
engine:

- one recurring place whose small states touch several systems;
- eight finalized-day Galley rotations with real alternatives when a serving runs out;
- a bounded maintenance procedure;
- a directed, extraction-reachable deck graph;
- four role-exact crew briefings and signed handoffs;
- three authored routes, each with safe-return and deep-recovery outcomes;
- eight encounters that state mechanical truth while sealing interpretation;
- deterministic 8–9 beat journey projections and debriefs that carry evidence,
  resource costs, contributions, bounded injury/recovery, and exact custody;
- provenance-shaped relic candidates and explicit beta-to-alpha hooks.

No Neocadia characters, setting, prose, currency, reward arithmetic, or proper
nouns were copied. The `.dungeon` work contributed authoring lessons—small
directed graphs, explicit gates, finite resources, alternate routes, exact
objectives—not finished rooms or fiction.

## Files

- `pack.json` — the draft content pack.
- `schema/poa-beta-content-pack.schema.json` — its author-facing JSON Schema.
- `tests/validate.mjs` — structural, cross-reference, reachability, budget,
  canon-boundary, and hostile-mutation checks without third-party packages.
- `tests/night-watch-journey.test.mjs` — all six route/extraction journeys,
  daily rotation, sold-out alternative, injury/recovery, beta-promotion, and
  holder-equality checks.
- `NIGHT-WATCH.md` — operator/editor map of the authored player journey and the
  deliberately unimplemented runtime seams.
- `SENTYR-EDIT-GUIDE.md` — the short editorial pass that turns this from our
  proposal into Sentyr's beta content.

## Validate

```sh
npm test
```

The validator does not claim to be the eventual Lean content compiler. It
checks the pack's authoring contract early. Activation still requires a
content-addressed artifact, curator signature, Lean-owned rules, and the normal
release ceremony.

## `poa-pack` operator CLI

The dependency-free CLI validates the JSON Schema and cross-references, derives
every phase-aware directed route to extraction, emits deterministic canonical
bytes, produces a spoiler-redacted numeric bundle and opaque-ID Lean-wire
fixture, previews routes/outcomes/candidates, diffs packs, and prepares signed
activation and rollback material. It never generates a signing key: `sign`
requires an explicit caller-owned Ed25519 PEM path, while `verify` requires an
external public-key pin.

```sh
npm test
npm run validate

node tools/poa-pack.mjs validate \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json \
  --wire-out /tmp/poa-wire.json

node tools/poa-pack.mjs public-bundle \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json \
  --out /tmp/poa-public.json

node tools/poa-pack.mjs preview \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json

node tools/poa-pack.mjs night-watch \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json \
  --day 1 --choice steady-bowl --serving available \
  --route maintenanceSpine --extraction descendFurther

# Genesis request, then an explicit caller-owned key and external pin.
node tools/poa-pack.mjs request \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json \
  --epoch 1 --counter 1 --genesis true --out /tmp/poa-request.json
node tools/poa-pack.mjs sign \
  --request /tmp/poa-request.json --pack pack.json \
  --schema schema/poa-beta-content-pack.schema.json \
  --key /secure/operator-owned-ed25519-private.pem \
  --out /tmp/poa-envelope.json
node tools/poa-pack.mjs verify \
  --envelope /tmp/poa-envelope.json \
  --public-key /secure/externally-pinned-ed25519-public.pem \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json
```

Run `node tools/poa-pack.mjs help` for exact successor, rollback, migration
manifest, diff, and proposal-only alpha commands. Successor signing requires the
previous envelope and its external key pin again; rollback additionally requires
the historical target envelope and pin. Counters always advance by exactly one,
including rollback.

The report deliberately says `not-invoked-no-json-decoder-or-export`: the
authoring validator is JavaScript, not Lean. The emitted wire fixture names the
current module compile gate and the exact future JSON gate command without
claiming that the missing decoder exists today.
