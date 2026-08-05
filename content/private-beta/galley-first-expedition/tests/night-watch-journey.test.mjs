import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildNightWatchJourney,
  canonicalBytes,
  selectDailyRotation,
  validateCrossReferences,
} from "../tools/poa-pack-lib.mjs";

const root = new URL("../", import.meta.url);
const execFileAsync = promisify(execFile);
const pack = JSON.parse(await readFile(new URL("pack.json", root), "utf8"));
const schema = JSON.parse(
  await readFile(new URL("schema/poa-beta-content-pack.schema.json", root), "utf8"),
);

function errorCode(expected) {
  return (error) => error?.code === expected;
}

function optionsFor(routeId, extraction = "returnNow", finalizedDay = 1) {
  const rotation = selectDailyRotation(pack, finalizedDay);
  return {
    finalizedDay,
    choiceId: rotation.choices[0].id,
    servingAvailable: true,
    routeId,
    extraction,
  };
}

test("eight finalized-day Galley rotations cycle from settled day state, never browser time", () => {
  assert.equal(pack.commonsRotations.length, 8);
  const firstCycle = Array.from(
    { length: pack.commonsRotations.length },
    (_, index) => selectDailyRotation(pack, index + 1).id,
  );
  assert.deepEqual(firstCycle, pack.commonsRotations.map((rotation) => rotation.id));
  assert.equal(selectDailyRotation(pack, 9).id, firstCycle[0]);
  assert.equal(selectDailyRotation(pack, 16).id, firstCycle[7]);
  assert.throws(() => selectDailyRotation(pack, 0), errorCode("FINALIZED_DAY"));
  assert.throws(() => selectDailyRotation(pack, 1.5), errorCode("FINALIZED_DAY"));
});

test("every route and extraction composes one bounded 8-9 beat night watch", () => {
  for (const [routeIndex, route] of pack.crewMission.routes.entries()) {
    for (const extraction of ["returnNow", "descendFurther"]) {
      const journey = buildNightWatchJourney(
        pack,
        schema,
        optionsFor(route.id, extraction, routeIndex + 1),
      );
      assert.equal(journey.schema, "POA-NIGHT-WATCH-JOURNEY-V1");
      assert.equal(journey.beats.length, route.encounterIds.length + 4);
      assert(journey.beats.length >= 6 && journey.beats.length <= 9);
      assert.deepEqual(
        journey.beats.map((beat) => beat.kind),
        [
          "galley-commons",
          "galley-maintenance",
          "crew-handoff",
          ...route.encounterIds.map(() => "deck-encounter"),
          "debrief",
        ],
      );
      assert.deepEqual(
        journey.beats.filter((beat) => beat.kind === "deck-encounter").map((beat) => beat.id),
        route.encounterIds,
      );
      const debrief = journey.beats.at(-1);
      const authoredOutcome = pack.crewMission.routeOutcomes.find(
        (outcome) => outcome.route === route.id && outcome.extraction === extraction,
      );
      assert.equal(debrief.operationalCost, authoredOutcome.operationalCost);
      assert.deepEqual(debrief.contribution, authoredOutcome.contribution);
      assert.deepEqual(debrief.recovery, authoredOutcome.recoveryConsequence);
      assert.equal(debrief.featuredEvidence.id, authoredOutcome.featuredArtifactId);
    }
  }
});

test("the journey carries role decisions, evidence, resources, injury, and recovery into debrief", () => {
  const journey = buildNightWatchJourney(
    pack,
    schema,
    optionsFor("maintenanceSpine", "descendFurther", 4),
  );
  const handoff = journey.beats.find((beat) => beat.kind === "crew-handoff");
  assert.deepEqual(
    handoff.roles.map((role) => role.role),
    ["pathfinder", "engineer", "containment", "quartermaster"],
  );
  assert(handoff.roles.every((role) => role.playerQuestion.length > 20));

  const encounters = journey.beats.filter((beat) => beat.kind === "deck-encounter");
  assert(encounters.every((beat) => beat.choicePrompt.length > 20));
  assert(encounters.every((beat) => beat.onSuccess.length > 20));
  assert(encounters.every((beat) => beat.onFailure.length > 20));
  assert(encounters.every((beat) => beat.betaEvidenceIds.length > 0));

  const debrief = journey.beats.at(-1);
  assert.equal(debrief.recovery.grade, "injured");
  assert.match(debrief.recovery.draftEffect, /wrist is wrapped/i);
  assert.match(debrief.recovery.duration, /recovery daily/i);
  assert(debrief.operationalCost > 0);
  assert(debrief.contribution.score > 0);
  assert(debrief.contribution.relicIds.includes("silent-bearing"));
  assert.equal(debrief.featuredEvidence.interpretation, null);
});

test("sold-out service changes hospitality copy, never score or expedition power", () => {
  const available = buildNightWatchJourney(
    pack,
    schema,
    optionsFor("signalGallery", "returnNow", 2),
  );
  const alternativeOptions = optionsFor("signalGallery", "returnNow", 2);
  alternativeOptions.servingAvailable = false;
  const alternative = buildNightWatchJourney(pack, schema, alternativeOptions);
  assert.notEqual(
    available.beats[0].choice.resultCopy,
    alternative.beats[0].choice.resultCopy,
  );
  assert.equal(available.beats[0].gameplayContribution, null);
  assert.equal(alternative.beats[0].gameplayContribution, null);
  assert.deepEqual(available.beats.slice(1), alternative.beats.slice(1));
});

test("night watch admission and output contain no holder gameplay advantage", () => {
  const journey = buildNightWatchJourney(
    pack,
    schema,
    optionsFor("sealedNave", "descendFurther", 5),
  );
  assert.deepEqual(journey.access, {
    walletRequired: false,
    tokenHoldingRequired: false,
    holderGameplayMultiplier: 1,
    nonHolderGameplayMultiplier: 1,
  });

  const hostileOptions = {
    ...optionsFor("sealedNave", "descendFurther", 5),
    holderBalance: 1,
  };
  assert.throws(
    () => buildNightWatchJourney(pack, schema, hostileOptions),
    errorCode("NIGHT_WATCH_OPTIONS"),
  );

  const hostilePack = structuredClone(pack);
  hostilePack.crewMission.routes[0].holderMultiplier = 2;
  assert.throws(
    () => validateCrossReferences(hostilePack),
    errorCode("HOLDER_GAMEPLAY_ADVANTAGE"),
  );
});

test("debrief exposes promotable beta candidates but cannot promote them", () => {
  for (const route of pack.crewMission.routes) {
    const journey = buildNightWatchJourney(
      pack,
      schema,
      optionsFor(route.id, "descendFurther", 6),
    );
    const debrief = journey.beats.at(-1);
    assert.equal(journey.canon.tier, "beta");
    assert.equal(journey.canon.authoritative, false);
    assert.equal(journey.canon.automaticPromotion, false);
    assert.equal(debrief.promotion.status, "beta-candidate-only");
    assert.equal(debrief.promotion.automatic, false);
    assert(debrief.promotion.hookIds.length > 0);
    for (const hookId of debrief.promotion.hookIds) {
      const hook = pack.promotionHooks.find((candidate) => candidate.id === hookId);
      assert(hook, `unknown promotion hook ${hookId}`);
      assert.equal(hook.alphaValue, null);
      assert(hook.sentyrDecision.length > 20);
      assert(hook.ifDeclined.length > 20);
    }
  }
});

test("night-watch CLI emits the exact deterministic journey projection", async () => {
  const cliPath = fileURLToPath(new URL("../tools/poa-pack.mjs", import.meta.url));
  const packPath = fileURLToPath(new URL("../pack.json", import.meta.url));
  const schemaPath = fileURLToPath(
    new URL("../schema/poa-beta-content-pack.schema.json", import.meta.url),
  );
  const args = [
    cliPath,
    "night-watch",
    "--pack",
    packPath,
    "--schema",
    schemaPath,
    "--day",
    "7",
    "--choice",
    selectDailyRotation(pack, 7).choices[0].id,
    "--serving",
    "alternative",
    "--route",
    "maintenanceSpine",
    "--extraction",
    "descendFurther",
  ];
  const first = await execFileAsync(process.execPath, args);
  const second = await execFileAsync(process.execPath, args);
  assert.equal(first.stderr, "");
  assert.equal(second.stderr, "");
  assert.deepEqual(canonicalBytes(JSON.parse(first.stdout)), canonicalBytes(JSON.parse(second.stdout)));
  assert.equal(JSON.parse(first.stdout).selection.servingAvailable, false);
});

test("unknown day choice, route, extraction, or option field refuses explicitly", () => {
  assert.throws(
    () => buildNightWatchJourney(pack, schema, optionsFor("maintenanceSpine", "returnNow", 0)),
    errorCode("FINALIZED_DAY"),
  );
  assert.throws(
    () => buildNightWatchJourney(pack, schema, {
      ...optionsFor("maintenanceSpine"),
      choiceId: "not-on-the-rail",
    }),
    errorCode("UNKNOWN_COMMONS_CHOICE"),
  );
  assert.throws(
    () => buildNightWatchJourney(pack, schema, {
      ...optionsFor("maintenanceSpine"),
      routeId: "secretElevator",
    }),
    errorCode("UNKNOWN_ROUTE"),
  );
  assert.throws(
    () => buildNightWatchJourney(pack, schema, {
      ...optionsFor("maintenanceSpine"),
      extraction: "stayForever",
    }),
    errorCode("UNKNOWN_EXTRACTION"),
  );
});
