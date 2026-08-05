import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pack = JSON.parse(await readFile(new URL("pack.json", root), "utf8"));
const schema = JSON.parse(
  await readFile(new URL("schema/poa-beta-content-pack.schema.json", root), "utf8"),
);

const ROUTES = ["maintenanceSpine", "signalGallery", "sealedNave"];
const ROLES = ["pathfinder", "engineer", "containment", "quartermaster"];
const EXTRACTIONS = ["returnNow", "descendFurther"];
const METERS = ["intel", "supplies", "cohesion", "influence", "score"];
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function ids(items, label) {
  invariant(Array.isArray(items), `${label} must be an array`);
  const values = items.map((item) => item.id);
  for (const value of values) {
    invariant(typeof value === "string" && ID.test(value), `${label} has invalid id ${value}`);
  }
  invariant(new Set(values).size === values.length, `${label} ids must be unique`);
  return new Set(values);
}

function nonempty(value, label) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be nonempty`);
}

function exactSet(actual, expected, label) {
  invariant(actual.length === expected.length, `${label} must contain exactly ${expected.join(", ")}`);
  invariant(expected.every((item) => actual.includes(item)), `${label} must contain exactly ${expected.join(", ")}`);
}

function validateContribution(value, budget, relicIds, label) {
  for (const meter of METERS) {
    invariant(Number.isInteger(value[meter]) && value[meter] >= 0, `${label}.${meter} must be a natural number`);
    invariant(value[meter] <= budget[meter], `${label}.${meter} exceeds the activated budget`);
  }
  invariant(Array.isArray(value.relicIds), `${label}.relicIds must be an array`);
  invariant(new Set(value.relicIds).size === value.relicIds.length, `${label}.relicIds must be unique`);
  for (const relicId of value.relicIds) {
    invariant(relicIds.has(relicId), `${label} names undeclared relic ${relicId}`);
    invariant(budget.relicIds.includes(relicId), `${label} relic ${relicId} is not allowlisted by the contribution budget`);
  }
}

function assertNoAlphaAssertion(value, path = "pack") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAlphaAssertion(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    invariant(key !== "alphaCanon", `${path}.${key} is forbidden; use an explicit curator successor`);
    invariant(!(key === "authoritative" && child === true), `${path}.${key} cannot be true in a beta draft`);
    assertNoAlphaAssertion(child, `${path}.${key}`);
  }
}

function validate(candidate) {
  invariant(candidate.schemaVersion === 1, "schemaVersion must be 1");
  invariant(candidate.status?.tier === "beta-draft", "pack must remain beta-draft");
  invariant(candidate.status?.spoilers === true, "spoiler marker must remain true");
  invariant(candidate.status?.authoritative === false, "draft cannot be authoritative");
  invariant(candidate.status?.storyAuthority === "Sentyr (@alteron808)", "story authority must remain explicit");
  invariant(candidate.status?.activationState === "not-activated", "this author pack cannot claim activation");
  invariant(candidate.canonBoundary?.gameplayTier === "beta", "gameplay tier must be beta");
  invariant(candidate.canonBoundary?.alphaAuthority === "sentyr-explicit-curator-action", "alpha authority is not delegated to play");
  invariant(candidate.canonBoundary?.automaticPromotion === false, "automatic promotion is forbidden");
  assertNoAlphaAssertion(candidate);

  const place = candidate.recurringPlace;
  invariant(ID.test(place.id), "recurring place id is invalid");
  invariant(place.playerVerbs.length >= 3, "recurring place needs at least three return verbs");
  invariant(new Set(place.playerVerbs).size === place.playerVerbs.length, "return verbs must be unique");
  ids(place.stations, "recurring place stations");
  invariant(place.stations.length >= 3, "recurring place needs at least three stations");
  invariant(place.persistentTraces.length >= 2, "recurring place needs persistent traces");
  invariant(place.sentyrQuestions.length >= 1, "recurring place must expose author questions");

  ids(candidate.commonsRotations, "commons rotations");
  invariant(candidate.commonsRotations.length >= 1 && candidate.commonsRotations.length <= 16, "commons rotations must be bounded 1..16");
  for (const rotation of candidate.commonsRotations) {
    nonempty(rotation.sceneCopy, `rotation ${rotation.id} sceneCopy`);
    ids(rotation.choices, `rotation ${rotation.id} choices`);
    invariant(rotation.choices.length >= 3 && rotation.choices.length <= 8, `rotation ${rotation.id} needs 3..8 choices`);
    for (const choice of rotation.choices) {
      invariant(Number.isInteger(choice.capacity) && choice.capacity > 0, `choice ${choice.id} needs positive capacity`);
      invariant(Number.isInteger(choice.localService) && choice.localService >= 0 && choice.localService <= 100, `choice ${choice.id} local service exceeds Lean cap`);
      nonempty(choice.servedCopy, `choice ${choice.id} servedCopy`);
      nonempty(choice.alternativeCopy, `choice ${choice.id} alternativeCopy`);
      invariant(choice.servedCopy !== choice.alternativeCopy, `choice ${choice.id} needs a real neighborly alternative`);
    }
  }

  const procedure = candidate.maintenanceProcedure;
  ids(procedure.procedure, "maintenance procedure");
  invariant(procedure.procedure.length >= 1 && procedure.procedure.length <= 8, "maintenance procedure exceeds Lean's 8-step cap");
  invariant(procedure.successCondition === "exact-ordered-procedure", "maintenance must remain exact and ordered");
  for (const step of procedure.procedure) {
    nonempty(step.prompt, `maintenance ${step.id} prompt`);
    nonempty(step.completionCue, `maintenance ${step.id} completionCue`);
    nonempty(step.outOfOrderCue, `maintenance ${step.id} outOfOrderCue`);
  }

  const mission = candidate.crewMission;
  invariant(Number.isInteger(mission.turnBudget) && mission.turnBudget > 0 && mission.turnBudget <= 64, "turn budget must be bounded 1..64");
  invariant(Number.isInteger(mission.operationalBudget) && mission.operationalBudget > 0, "operational budget must be positive");
  exactSet(mission.roles.map((role) => role.role), ROLES, "crew roles");
  exactSet(mission.briefings.map((briefing) => briefing.role), ROLES, "crew briefings");
  invariant(mission.decisionRules.safeReturn === "two-specialist-route-support", "safe return rule drifted");
  invariant(mission.decisionRules.deepRecovery === "full-crew-unanimity", "deep recovery must remain unanimous");
  invariant(mission.decisionRules.privacy === "operator-visible-briefings-then-public-signed-handoffs", "privacy label must remain honest");

  const observationByRole = new Map([
    ["pathfinder", "mappedRoute"],
    ["engineer", "structurallySoundRoute"],
    ["containment", "hazardClearRoute"],
    ["quartermaster", "extractionWindow"],
  ]);
  for (const role of mission.roles) {
    invariant(role.privateObservationKind === observationByRole.get(role.role), `${role.role} observation kind is widened or relabelled`);
  }
  for (const briefing of mission.briefings) {
    invariant(briefing.disclosure === "private-until-signed-handoff", `${briefing.role} briefing leaks before handoff`);
    if (briefing.role === "quartermaster") {
      invariant(briefing.recommendedRoute === null, "quartermaster gets an extraction window, not fabricated route corroboration");
    } else {
      invariant(ROUTES.includes(briefing.recommendedRoute), `${briefing.role} briefing needs an authored route`);
    }
  }

  const topology = mission.topology;
  const roomIds = ids(topology.rooms, "deck rooms");
  const edgeIds = ids(topology.edges, "deck edges");
  invariant(edgeIds.size <= 512, "deck exceeds hotspot cap");
  invariant(roomIds.has(topology.entryRoom), "entry room is undeclared");
  invariant(roomIds.has(topology.extractionRoom), "extraction room is undeclared");
  const adjacency = new Map([...roomIds].map((room) => [room, []]));
  for (const edge of topology.edges) {
    invariant(roomIds.has(edge.from), `edge ${edge.id} starts in unknown room ${edge.from}`);
    invariant(roomIds.has(edge.to), `edge ${edge.id} ends in unknown room ${edge.to}`);
    adjacency.get(edge.from).push(edge.to);
  }
  const reachable = new Set([topology.entryRoom]);
  const queue = [topology.entryRoom];
  while (queue.length) {
    const room = queue.shift();
    for (const next of adjacency.get(room)) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  invariant(reachable.has(topology.extractionRoom), "declared extraction is unreachable from entry");

  exactSet(mission.routes.map((route) => route.id), ROUTES, "mission routes");
  const encounterIds = ids(mission.encounters, "encounters");
  invariant(mission.encounters.length >= 6 && mission.encounters.length <= 10, "first expedition needs 6..10 encounters");
  const artifactIds = ids(mission.artifacts, "beta artifacts");
  for (const artifact of mission.artifacts) {
    invariant(artifact.interpretation === null, `artifact ${artifact.id} invents an interpretation`);
    nonempty(artifact.mechanicalFact, `artifact ${artifact.id} mechanicalFact`);
  }
  for (const encounter of mission.encounters) {
    invariant(roomIds.has(encounter.roomId), `encounter ${encounter.id} names unknown room ${encounter.roomId}`);
    invariant(encounter.routeIds.length >= 1 && new Set(encounter.routeIds).size === encounter.routeIds.length, `encounter ${encounter.id} route ids must be nonempty and unique`);
    encounter.routeIds.forEach((route) => invariant(ROUTES.includes(route), `encounter ${encounter.id} names unknown route ${route}`));
    encounter.betaArtifactIds.forEach((artifact) => invariant(artifactIds.has(artifact), `encounter ${encounter.id} names unknown artifact ${artifact}`));
    nonempty(encounter.mechanicalTruth, `encounter ${encounter.id} mechanicalTruth`);
    invariant(encounter.sealedInterpretationQuestions.length >= 1, `encounter ${encounter.id} must retain a sealed interpretation boundary`);
  }
  for (const route of mission.routes) {
    invariant(route.encounterIds.length >= 2, `route ${route.id} needs multiple encounters`);
    for (const encounterId of route.encounterIds) {
      invariant(encounterIds.has(encounterId), `route ${route.id} names unknown encounter ${encounterId}`);
      const encounter = mission.encounters.find((item) => item.id === encounterId);
      invariant(encounter.routeIds.includes(route.id), `route ${route.id} and encounter ${encounterId} disagree`);
    }
  }

  const relicIds = ids(candidate.relicCandidates, "relic candidates");
  for (const relic of candidate.relicCandidates) {
    invariant(encounterIds.has(relic.sourceEncounterId), `relic ${relic.id} names unknown encounter ${relic.sourceEncounterId}`);
    invariant(relic.marketEligible === false, `relic ${relic.id} bypasses the crown/custody boundary`);
    invariant(relic.interpretation === null, `relic ${relic.id} invents an interpretation`);
  }
  validateContribution(procedure.semanticOutput, mission.contributionBudget, relicIds, "maintenance semantic output");

  invariant(mission.routeOutcomes.length === ROUTES.length * EXTRACTIONS.length, "route outcomes must cover the exact route/extraction product");
  const outcomeKeys = new Set();
  for (const outcome of mission.routeOutcomes) {
    invariant(ROUTES.includes(outcome.route), `outcome has unknown route ${outcome.route}`);
    invariant(EXTRACTIONS.includes(outcome.extraction), `outcome has unknown extraction ${outcome.extraction}`);
    const key = `${outcome.route}:${outcome.extraction}`;
    invariant(!outcomeKeys.has(key), `duplicate route outcome ${key}`);
    outcomeKeys.add(key);
    const deep = outcome.extraction === "descendFurther";
    invariant(outcome.requiredAgreement === (deep ? "full-crew-unanimity" : "two-specialist-route-support"), `${key} has the wrong agreement rule`);
    const mandatorySpecialistSpend = deep ? 6 : 3;
    invariant(outcome.operationalCost + mandatorySpecialistSpend <= mission.operationalBudget, `${key} is globally unwinnable under the operational budget`);
    invariant(artifactIds.has(outcome.featuredArtifactId), `${key} names unknown featured artifact`);
    invariant(outcome.recoveryConsequence.implementationState === "content-draft-not-yet-semantic", `${key} overclaims a deployed recovery consequence`);
    validateContribution(outcome.contribution, mission.contributionBudget, relicIds, `outcome ${key}`);
  }
  for (const route of ROUTES) {
    for (const extraction of EXTRACTIONS) {
      invariant(outcomeKeys.has(`${route}:${extraction}`), `missing outcome ${route}:${extraction}`);
    }
  }

  const candidateRefs = new Set([place.id, ...artifactIds, ...relicIds]);
  ids(candidate.promotionHooks, "promotion hooks");
  for (const hook of candidate.promotionHooks) {
    invariant(candidateRefs.has(hook.candidateRef), `promotion hook ${hook.id} names unknown candidate ${hook.candidateRef}`);
    invariant(hook.alphaValue === null, `promotion hook ${hook.id} self-promotes without Sentyr`);
    nonempty(hook.sentyrDecision, `promotion hook ${hook.id} sentyrDecision`);
    nonempty(hook.ifDeclined, `promotion hook ${hook.id} ifDeclined`);
  }

  return true;
}

function clone(value) {
  return structuredClone(value);
}

function mustRefuse(label, mutate, pattern) {
  const hostile = clone(pack);
  mutate(hostile);
  assert.throws(() => validate(hostile), pattern, label);
}

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.properties.schemaVersion.const, 1);
assert(schema.required.includes("canonBoundary"));
assert(schema.required.includes("crewMission"));
assert.equal(validate(pack), true);

mustRefuse(
  "sold-out choices need a neighborly alternative",
  (value) => { value.commonsRotations[0].choices[0].alternativeCopy = ""; },
  /alternativeCopy must be nonempty/,
);
mustRefuse(
  "extraction reachability is load-bearing",
  (value) => {
    value.crewMission.topology.rooms.push({ id: "isolated-extraction", workingName: "Isolated", sensoryDraft: "Hostile fixture." });
    value.crewMission.topology.extractionRoom = "isolated-extraction";
  },
  /extraction is unreachable/,
);
mustRefuse(
  "undeclared salvage cannot enter an outcome",
  (value) => { value.crewMission.routeOutcomes[1].contribution.relicIds = ["invented-relic"]; },
  /undeclared relic/,
);
mustRefuse(
  "deep recovery stays unanimous",
  (value) => { value.crewMission.routeOutcomes[1].requiredAgreement = "two-specialist-route-support"; },
  /wrong agreement rule/,
);
mustRefuse(
  "draft hooks cannot fill their own alpha value",
  (value) => { value.promotionHooks[0].alphaValue = "the game voted this into canon"; },
  /self-promotes without Sentyr/,
);
mustRefuse(
  "budgets are exact",
  (value) => { value.crewMission.routeOutcomes[0].contribution.supplies = 999; },
  /exceeds the activated budget/,
);
mustRefuse(
  "route and encounter membership must agree",
  (value) => { value.crewMission.encounters[0].routeIds = ["maintenanceSpine"]; },
  /route signalGallery and encounter counting-clearances disagree/,
);
mustRefuse(
  "market eligibility cannot skip provenance and crown",
  (value) => { value.relicCandidates[0].marketEligible = true; },
  /bypasses the crown\/custody boundary/,
);
mustRefuse(
  "the pack cannot relabel itself alpha canon",
  (value) => { value.alphaCanon = true; },
  /alphaCanon is forbidden/,
);

console.log(
  `validated ${pack.packId}: ` +
    `${pack.commonsRotations.length} commons rotations, ` +
    `${pack.maintenanceProcedure.procedure.length} maintenance steps, ` +
    `${pack.crewMission.encounters.length} encounters, ` +
    `${pack.crewMission.routeOutcomes.length} exact route outcomes, ` +
    `${pack.relicCandidates.length} non-market relic candidates, ` +
    `${pack.promotionHooks.length} Sentyr-only promotion hooks`,
);
