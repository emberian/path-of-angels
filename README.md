# Path of Angels

Private collaboration source for the *Path of Angels* interactive web series
and the game platform aboard the Khovokhi.

The show operates at the macro scale: where the ship goes and what becomes
alpha canon. The platform operates at the micro scale: short instruments and
drills, crew expeditions into the ship's unexplored decks, exact field records,
persistent attendants, evidence archives, DREGG-enabled participation, and
experimental DrEX/private-market mechanics.

The protected beta is at <https://beta.pathofangels.network>.

## Start here

- `metatheory/Dregg2/Games/PathOfAngels/` is the semantic center. Game rules,
  legal transitions, contributions, replay laws, custody, and editorial
  boundaries are written in Lean wherever practical.
- `poa-web/` is the authenticated ship terminal and its browser tests. It
  consumes signed, Lean-emitted artifacts rather than reimplementing rules in
  JavaScript.
- `poa-curator/` is the narrow content-epoch and editorial review edge.
- `extension/` contains the selected YouTube/X companion and Signal workflow.
- `poa/artifacts/poag1/` is generated, signed browser material. It is not the
  source of game semantics.
- `docs/poa/PLATFORM-ROADMAP.md` is the broad product map; the other included
  documents cover current staging, Neocadia-derived mechanic shapes, and the
  honest Dark Bazaar guarantee ledger.
- `docs/poa/SENTYR-BRIEF.md` is the current shareable tour and mechanics menu
  for the show's author.

Read [SOURCE-MAP.md](SOURCE-MAP.md) before treating this as a standalone
monorepo. Execution, persistence, Solana admission, proofs, FHE/MPC, and live
federation infrastructure remain in private Dregg repositories and are
referenced by exact source path rather than copied here in incomplete slices.

## Product laws

1. Sentyr authors alpha canon. Games may create exact beta artifacts, never an
   automatic episode script.
2. Every consequential result should be recordable, replayable, and
   independently re-judged.
3. Lean owns value-deciding semantics wherever practical. Rust and TypeScript
   transport, persist, render, and invoke those semantics.
4. Receipts state their exact grade. Local replay, operator-visible privacy,
   threshold privacy, and independently operated threshold privacy are not the
   same claim.
5. DREGG may gate services, participation modes, sponsorship, and bounded
   community procedures. It does not buy stronger loot, safer runs, or canon.
6. Mechanics do not depend on secret source. Spoilers may be sealed;
   governance and fairness may not be.

## Provenance

The current reviewed collaboration snapshot was exported from `emberian/dregg`
commit `a9fd19dbc0f938939ec06715b50b4bae98d0ffc3` on 2026-08-05. The initial
snapshot was `83a7dce8663fe688d922ff2b92578c0de7445c07`. A copied file is a collaboration
surface; signed release receipts and their exact Dregg commits remain
deployment authority.

Code is AGPL-3.0-or-later unless a file says otherwise. See [LICENSE](LICENSE)
and [CONTENT-RIGHTS.md](CONTENT-RIGHTS.md).
