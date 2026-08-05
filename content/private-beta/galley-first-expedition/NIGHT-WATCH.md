# One True Night Watch — private beta operator map

This is a playable content shape, not alpha canon. It records what the beta
engine may present and settle. It does not decide what the Khovokhi is, why its
machinery behaves this way, whether any recovered object matters to the show,
or what the crew ultimately calls these places. Only an explicit curator action
by Sentyr may promote a candidate; popularity, `$DREGG`, custody, and repeated
play do not.

## The 8–9 beat watch

1. **Galley Commons.** A finalized day chooses one of eight rotations. The
   player takes a featured serving or receives a fully written neighborly
   alternative. Neither version grants score, expedition power, safety, or
   better loot.
2. **Maintenance.** The player bleeds the return line through seven exact
   ordered actions. Success contributes supplies and cohesion; incomplete or
   out-of-order work remains safe and contributes nothing.
3. **Crew handoff.** Pathfinder, engineer, containment, and quartermaster each
   get a distinct question and command vocabulary. Safe return needs two
   specialist supports. Deep recovery needs all four.
4. **Deck/anomaly beats.** Each route contributes four or five encounters. Every
   encounter names the decision, success, failure, and beta evidence it can
   record. Interpretive questions remain sealed from the journey projection.
5. **Debrief.** The terminal route/extraction pair fixes the operational cost,
   contribution, featured evidence, exact carried relic IDs, and bounded
   recovery state. A deep Maintenance Spine recovery exercises an officer
   injury and a subsequent Galley recovery daily; the other outcomes exercise
   clean return, marked equipment, lost opportunity, and containment debt.

The CLI composes this view without adding facts to `pack.json`:

```sh
node tools/poa-pack.mjs night-watch \
  --pack pack.json --schema schema/poa-beta-content-pack.schema.json \
  --day 6 --choice cool-grain --serving alternative \
  --route maintenanceSpine --extraction descendFurther
```

The output is deterministic for those inputs and carries the pack's canonical
content root. It explicitly declares equal 1× gameplay multipliers for holders
and non-holders, no wallet requirement, beta status, no automatic promotion,
and Sentyr's curator authority.

## Route menu

### Maintenance Spine

The crew crosses a support that moves before the load arrives and opens the
return edge by replaying exact pressure intervals. Returning now preserves a
repair trace. Descending further recovers the Silent Bearing, consumes more
margin, quarantines the part, and produces a bounded compression injury whose
recovery touches the Galley on a later finalized day.

### Signal Gallery

The crew chooses how long to spend triangulating a sequence with no visible
sender, then screens a corridor through twelve heatless points that organize
around carried equipment. Returning now archives raw timing without meaning.
Descending further recovers the Index Film and leaves it visibly responsive but
uninterpreted.

### Sealed Nave

Two different roles must perform an observation handoff before the threshold
changes phase. The crew can return with that signed evidence or unanimously
exchange a calibration block for the Threshold Wedge. The latter is exact
custody plus exact debt, not a declaration that the object is a key, tool,
weapon, or anything else.

## Honest engine deficits

The existing v1 author schema is strong enough to express the watch without a
new content format, but it does not yet express several runtime distinctions:

- encounter decisions are authored prose, not stable choice IDs with Lean-owned
  preconditions and per-choice effect deltas;
- a route/extraction pair has one terminal result, so injury caused by a
  particular failed choice cannot yet select a distinct outcome honestly;
- recovery copy is explicitly `content-draft-not-yet-semantic`; role lockout,
  treatment completion, and visible prop changes still need event types and a
  replay projection;
- serving capacity and the sold-out alternative need finalized-day allocation
  receipts before a server may claim shared scarcity;
- private briefings identify their role and disclosure rule, but not an exact
  recipient key or a threshold-private handoff transcript;
- debrief text currently derives from the terminal recovery effect and evidence
  records; there is no separately versioned debrief-copy object;
- the JavaScript journey projection validates authoring and content roots, but
  it is not the Lean game decider and cannot settle an event batch.

These are implementation seams, not invitations for the client to improvise.
Until the relevant Lean/event-sourced carriers exist, the night-watch output is
a deterministic private-beta scenario projection only.
