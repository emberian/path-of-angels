# Source map and trust boundaries

This repository intentionally contains the game-facing collaboration boundary,
not an incomplete copy of every Dregg subsystem.

| Area | Included path | Role |
|---|---|---|
| Lean game semantics | `metatheory/Dregg2/Games/PathOfAngels/` | Judges, games, replay, contributions, custody, canon |
| Browser terminal | `poa-web/` | Signed artifact loading, rendering, local play, labs |
| Curator edge | `poa-curator/` | Exact content epochs, deterministic review, signed editorial requests |
| Browser artifacts | `poa/artifacts/poag1/` | Generated and signed Lean-derived descriptors/tables |
| Curator public pin | `poa/config/curator-key.json` | Public verification material only |
| YouTube/X companion | selected `extension/` files | Authenticated routing and exact Signal publication workflow |
| Product map | `docs/poa/` | Platform, mechanics, staging, and privacy/DrEX claim ledger |

## Canonical Dregg seams not copied here

At upstream commit `83a7dce8663fe688d922ff2b92578c0de7445c07`:

- native Lean calls: `dregg-lean-ffi/src/poa_*.rs` and PoA probes;
- node execution/admission: `node/src/poa_*.rs` plus node router wiring;
- durable history: `persist/src/poa_event_store.rs` and
  `persist/src/poa_signal_state.rs` plus the commit-log transaction;
- signed client carrier: `sdk/src/poa_signal.rs` and relevant WASM runtime;
- Solana holding admission: `poa-solana-gate/`, bridge holdings, and node/web
  adapters;
- DrEX/FHE/MPC: `dreggnet-market/`, `fhegg-*`, `circuit-prove/`, and
  `metatheory/Market/`;
- generic extension host/custody: the rest of `extension/`;
- source and release gates: `scripts/test-poa.sh` and the PoA artifact/devnet
  scripts;
- live deployment: the separate private `dregg-infra` repository.

The web terminal is directly inspectable and runnable with its checked bundle.
The selected Rust and Lean directories retain monorepo-relative dependencies;
build and proof authority remains the Dregg monorepo until those package
boundaries are deliberately extracted.

## Deliberate exclusions

- deployment definitions, topology, IPs, release staging, snapshots, and
  operator instructions;
- curator, validator, wallet, SSH, TLS, Basic Auth, RPC, or server secrets;
- active curator-key recovery paths and trust-reset operations;
- unrelated Dregg games, active circuit work, and workstation memory/log files;
- raw Neocadia-generated characters, setting, economy, and prose;
- unreleased Path of Angels story packs and media assets.

Public keys, signatures, manifests, generated game tables, and proof fixtures
are not secrets. They remain where they make an exact claim reproducible.
