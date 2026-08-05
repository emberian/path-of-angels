import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export const PACK_SCHEMA = "POA-PRIVATE-BETA-CONTENT-PACK-V1";
export const PUBLIC_SCHEMA = "POA-SPOILER-REDACTED-BUNDLE-V1";
export const WIRE_SCHEMA = "POA-CONTENT-CONTRACT-WIRE-V1";
export const REQUEST_SCHEMA = "POA-PACK-ACTIVATION-REQUEST-V1";
export const ENVELOPE_SCHEMA = "POA-PACK-ACTIVATION-ENVELOPE-V1";
export const MIGRATION_SCHEMA = "POA-PACK-MIGRATION-MANIFEST-V1";
export const PROPOSAL_SCHEMA = "POA-ALPHA-PROMOTION-PROPOSAL-V1";
export const NIGHT_WATCH_SCHEMA = "POA-NIGHT-WATCH-JOURNEY-V1";
export const SIGNING_DOMAIN = Buffer.from(
  "pathofangels.network/poa-pack-activation/v1\0",
  "utf8",
);
export const CURRENT_SCHEMA_VERSION = 1;
export const EXPECTED_SCHEMA_ID =
  "https://pathofangels.network/schema/private-beta-content-pack-v1.json";
export const CONTENT_CONTRACT_MODULE_GATE =
  "cd /Users/ember/dev/breadstuffs/metatheory && LEAN_NUM_THREADS=4 lake env lean Dregg2/Games/PathOfAngels/ContentContract.lean";
export const FUTURE_JSON_LEAN_GATE =
  "cd /Users/ember/dev/breadstuffs/metatheory && LEAN_NUM_THREADS=4 lake env lean --run Dregg2/Games/PathOfAngels/ContentContractJsonCli.lean -- --wire \"$POA_WIRE_FIXTURE\"";

const ROUTES = ["maintenanceSpine", "signalGallery", "sealedNave"];
const ROLES = ["pathfinder", "engineer", "containment", "quartermaster"];
const EXTRACTIONS = ["returnNow", "descendFurther"];
const METERS = ["intel", "supplies", "cohesion", "influence", "score"];
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

export class PoaPackError extends Error {
  constructor(code, message, path = "$") {
    super(`${code} at ${path}: ${message}`);
    this.name = "PoaPackError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, message, path = "$") {
  throw new PoaPackError(code, message, path);
}

function invariant(condition, code, message, path = "$") {
  if (!condition) fail(code, message, path);
}

function exactObjectKeys(value, expected, code, path = "$") {
  invariant(value && typeof value === "object" && !Array.isArray(value), code, "expected object", path);
  const actual = Object.keys(value).sort(byteCompare);
  const wanted = [...expected].sort(byteCompare);
  invariant(
    canonicalJson(actual) === canonicalJson(wanted),
    code,
    `expected exact fields ${wanted.join(", ")}; got ${actual.join(", ")}`,
    path,
  );
}

function byteCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertCanonicalValue(value, path = "$") {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    invariant(
      Number.isSafeInteger(value),
      "NON_CANONICAL_NUMBER",
      "only safe integers are accepted",
      path,
    );
    return;
  }
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        invariant(
          next >= 0xdc00 && next <= 0xdfff,
          "NON_CANONICAL_STRING",
          "unpaired high surrogate",
          path,
        );
        index += 1;
      } else {
        invariant(
          unit < 0xdc00 || unit > 0xdfff,
          "NON_CANONICAL_STRING",
          "unpaired low surrogate",
          path,
        );
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCanonicalValue(item, `${path}/${index}`));
    return;
  }
  invariant(
    typeof value === "object" && value !== undefined,
    "NON_CANONICAL_TYPE",
    `unsupported JSON value ${typeof value}`,
    path,
  );
  for (const [key, child] of Object.entries(value)) {
    assertCanonicalValue(key, `${path}/<key>`);
    assertCanonicalValue(child, `${path}/${escapePointer(key)}`);
  }
}

export function canonicalJson(value) {
  assertCanonicalValue(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort(byteCompare);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

export function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function contentRoot(value) {
  return sha256Bytes(canonicalBytes(value));
}

export async function readJson(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail("JSON_READ", error.message, path);
  }
  assertCanonicalValue(parsed);
  return parsed;
}

export async function writeCanonicalNew(path, value) {
  await writeFile(path, canonicalBytes(value), { flag: "wx", mode: 0o644 });
}

function resolveRef(rootSchema, reference) {
  invariant(
    reference.startsWith("#/"),
    "SCHEMA_REF",
    `only local schema references are supported: ${reference}`,
  );
  let current = rootSchema;
  for (const raw of reference.slice(2).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    invariant(
      current && Object.hasOwn(current, key),
      "SCHEMA_REF",
      `unresolved schema reference ${reference}`,
    );
    current = current[key];
  }
  return current;
}

function typeMatches(value, type) {
  switch (type) {
    case "null":
      return value === null;
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      fail("SCHEMA_KEYWORD", `unsupported schema type ${type}`);
  }
}

function schemaErrors(value, schema, rootSchema, path = "$") {
  if (schema.$ref) return schemaErrors(value, resolveRef(rootSchema, schema.$ref), rootSchema, path);
  if (schema.oneOf) {
    const branches = schema.oneOf.map((branch) => schemaErrors(value, branch, rootSchema, path));
    const passing = branches.filter((errors) => errors.length === 0);
    if (passing.length === 1) return [];
    return [
      {
        code: "SCHEMA_ONE_OF",
        path,
        message: `expected exactly one matching branch; got ${passing.length}`,
      },
    ];
  }
  const errors = [];
  const push = (code, message, at = path) => errors.push({ code, path: at, message });
  if (schema.type && !typeMatches(value, schema.type)) {
    push("SCHEMA_TYPE", `expected ${schema.type}`);
    return errors;
  }
  if (Object.hasOwn(schema, "const") && canonicalJson(value) !== canonicalJson(schema.const)) {
    push("SCHEMA_CONST", `expected constant ${canonicalJson(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => canonicalJson(candidate) === canonicalJson(value))) {
    push("SCHEMA_ENUM", "value is not in the declared enum");
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) {
      push("SCHEMA_MIN_LENGTH", `minimum length is ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      push("SCHEMA_PATTERN", `does not match ${schema.pattern}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      push("SCHEMA_MINIMUM", `minimum is ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      push("SCHEMA_MAXIMUM", `maximum is ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      push("SCHEMA_MIN_ITEMS", `minimum item count is ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      push("SCHEMA_MAX_ITEMS", `maximum item count is ${schema.maxItems}`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map(canonicalJson);
      if (new Set(serialized).size !== serialized.length) {
        push("SCHEMA_UNIQUE_ITEMS", "array items must be unique");
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...schemaErrors(item, schema.items, rootSchema, `${path}/${index}`));
      });
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        push("SCHEMA_REQUIRED", `missing required property ${required}`, `${path}/${escapePointer(required)}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          push("SCHEMA_ADDITIONAL", `unknown property ${key}`, `${path}/${escapePointer(key)}`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        errors.push(
          ...schemaErrors(value[key], childSchema, rootSchema, `${path}/${escapePointer(key)}`),
        );
      }
    }
  }
  return errors;
}

export function validateSchema(pack, schema) {
  invariant(
    schema.$schema === "https://json-schema.org/draft/2020-12/schema",
    "SCHEMA_DIALECT",
    "expected JSON Schema draft 2020-12",
  );
  invariant(
    schema.$id === EXPECTED_SCHEMA_ID,
    "SCHEMA_ID",
    `expected schema id ${EXPECTED_SCHEMA_ID}`,
  );
  const errors = schemaErrors(pack, schema, schema);
  if (errors.length > 0) {
    const first = errors[0];
    throw new PoaPackError(first.code, first.message, first.path);
  }
  return { engine: "poa-pack/dependency-free-json-schema-subset-v1", errorCount: 0 };
}

function escapePointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function collectIds(items, label, path) {
  invariant(Array.isArray(items), "CROSSREF_TYPE", `${label} must be an array`, path);
  const values = items.map((item) => item.id);
  values.forEach((value, index) => {
    invariant(typeof value === "string" && ID.test(value), "INVALID_ID", `${label} id is invalid`, `${path}/${index}/id`);
  });
  invariant(new Set(values).size === values.length, "DUPLICATE_ID", `${label} ids must be unique`, path);
  return new Set(values);
}

function exactSet(actual, expected, label, path) {
  invariant(actual.length === expected.length, "EXACT_SET", `${label} must contain exactly ${expected.join(", ")}`, path);
  invariant(expected.every((item) => actual.includes(item)), "EXACT_SET", `${label} must contain exactly ${expected.join(", ")}`, path);
}

function noAlphaAssertions(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => noAlphaAssertions(item, `${path}/${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    invariant(key !== "alphaCanon", "DIRECT_ALPHA", "alphaCanon is forbidden in a beta author pack", `${path}/${escapePointer(key)}`);
    invariant(!(key === "authoritative" && child === true), "DIRECT_ALPHA", "beta author pack cannot claim authority", `${path}/${escapePointer(key)}`);
    noAlphaAssertions(child, `${path}/${escapePointer(key)}`);
  }
}

const HOLDER_ADVANTAGE_FIELD =
  /(?:holder|wallet|token|dregg|balance|multiplier|boost|premium|paid)(?:only|gate|weight|power|reward|score|loot|access|advantage)?/iu;

function noHolderAdvantageFields(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => noHolderAdvantageFields(item, `${path}/${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    invariant(
      !HOLDER_ADVANTAGE_FIELD.test(key),
      "HOLDER_GAMEPLAY_ADVANTAGE",
      `identity- or balance-weighted gameplay field ${key} is forbidden in this open night watch`,
      `${path}/${escapePointer(key)}`,
    );
    noHolderAdvantageFields(child, `${path}/${escapePointer(key)}`);
  }
}

function edgeTransition(edge, phase) {
  if (edge.modifier === "phase0to1") return phase === 0 ? 1 : null;
  return phase;
}

function stateKey(room, phase) {
  return `${room}\0${phase}`;
}

function findPath(edges, startRoom, startPhase, targetRoom) {
  if (startRoom === targetRoom) return { edges: [], room: startRoom, phase: startPhase };
  const sortedEdges = [...edges].sort((left, right) => byteCompare(left.id, right.id));
  const queue = [{ room: startRoom, phase: startPhase, edges: [] }];
  const visited = new Set([stateKey(startRoom, startPhase)]);
  while (queue.length > 0) {
    const state = queue.shift();
    for (const edge of sortedEdges) {
      if (edge.from !== state.room) continue;
      const nextPhase = edgeTransition(edge, state.phase);
      if (nextPhase === null) continue;
      const next = { room: edge.to, phase: nextPhase, edges: [...state.edges, edge.id] };
      if (next.room === targetRoom) return next;
      const key = stateKey(next.room, next.phase);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return null;
}

export function deriveRoutePath(pack, route) {
  const mission = pack.crewMission;
  const encounters = new Map(mission.encounters.map((encounter) => [encounter.id, encounter]));
  const waypoints = route.encounterIds.map((id) => encounters.get(id).roomId);
  waypoints.push(mission.topology.extractionRoom);
  let room = mission.topology.entryRoom;
  let phase = 0;
  const path = [];
  for (const waypoint of waypoints) {
    const segment = findPath(mission.topology.edges, room, phase, waypoint);
    invariant(
      segment !== null,
      "ROUTE_UNREACHABLE",
      `route ${route.id} cannot traverse from ${room} at phase ${phase} to encounter room ${waypoint}`,
      "$/crewMission/routes",
    );
    path.push(...segment.edges);
    room = segment.room;
    phase = segment.phase;
  }
  invariant(
    room === mission.topology.extractionRoom,
    "ROUTE_UNREACHABLE",
    `route ${route.id} does not end at extraction`,
    "$/crewMission/routes",
  );
  return { edgeIds: path, finalPhase: phase };
}

function validateContribution(value, budget, relicIds, path) {
  for (const meter of METERS) {
    invariant(Number.isSafeInteger(value[meter]) && value[meter] >= 0, "CONTRIBUTION", `${meter} must be natural`, `${path}/${meter}`);
    invariant(value[meter] <= budget[meter], "BUDGET_EXCEEDED", `${meter} exceeds activated budget`, `${path}/${meter}`);
  }
  invariant(new Set(value.relicIds).size === value.relicIds.length, "DUPLICATE_ID", "contribution relic ids must be unique", `${path}/relicIds`);
  for (const relic of value.relicIds) {
    invariant(relicIds.has(relic), "UNDECLARED_RELIC", `undeclared relic ${relic}`, `${path}/relicIds`);
    invariant(budget.relicIds.includes(relic), "RELIC_NOT_ALLOWLISTED", `relic ${relic} is outside contribution budget`, `${path}/relicIds`);
  }
}

export function validateCrossReferences(pack) {
  invariant(pack.schemaVersion === CURRENT_SCHEMA_VERSION, "SCHEMA_VERSION", "schemaVersion must be 1");
  invariant(pack.status.tier === "beta-draft", "CANON_BOUNDARY", "pack must remain beta-draft");
  invariant(pack.status.spoilers === true, "SPOILER_MARKER", "private author pack must retain spoiler marker");
  invariant(pack.status.authoritative === false, "CANON_BOUNDARY", "draft cannot be authoritative");
  invariant(pack.status.activationState === "not-activated", "ACTIVATION_CLAIM", "author pack cannot claim activation");
  invariant(pack.canonBoundary.gameplayTier === "beta", "CANON_BOUNDARY", "gameplay tier must be beta");
  invariant(pack.canonBoundary.alphaAuthority === "sentyr-explicit-curator-action", "CANON_BOUNDARY", "alpha authority is curator-only");
  invariant(pack.canonBoundary.automaticPromotion === false, "AUTOMATIC_PROMOTION", "automatic promotion is forbidden");
  noAlphaAssertions(pack);
  noHolderAdvantageFields(pack);

  const placeIds = new Set([pack.recurringPlace.id]);
  collectIds(pack.recurringPlace.stations, "station", "$/recurringPlace/stations");
  collectIds(pack.commonsRotations, "commons rotation", "$/commonsRotations");
  invariant(
    pack.commonsRotations.length >= 7,
    "ROTATION_DEPTH",
    "the night watch requires at least seven finalized-day Galley rotations",
    "$/commonsRotations",
  );
  for (const [rotationIndex, rotation] of pack.commonsRotations.entries()) {
    collectIds(rotation.choices, "commons choice", `$/commonsRotations/${rotationIndex}/choices`);
    for (const [choiceIndex, choice] of rotation.choices.entries()) {
      invariant(choice.alternativeCopy.trim().length > 0, "MISSING_ALTERNATIVE", "sold-out choice requires neighborly alternative", `$/commonsRotations/${rotationIndex}/choices/${choiceIndex}/alternativeCopy`);
      invariant(choice.servedCopy !== choice.alternativeCopy, "MISSING_ALTERNATIVE", "alternative must be materially distinct", `$/commonsRotations/${rotationIndex}/choices/${choiceIndex}`);
    }
  }
  collectIds(pack.maintenanceProcedure.procedure, "maintenance step", "$/maintenanceProcedure/procedure");
  invariant(pack.maintenanceProcedure.procedure.length <= 8, "PROCEDURE_BOUND", "maintenance exceeds eight-step semantic bound", "$/maintenanceProcedure/procedure");
  invariant(pack.maintenanceProcedure.successCondition === "exact-ordered-procedure", "PROCEDURE_ORDER", "maintenance must be exact and ordered", "$/maintenanceProcedure/successCondition");

  const mission = pack.crewMission;
  exactSet(mission.roles.map((role) => role.role), ROLES, "crew roles", "$/crewMission/roles");
  exactSet(mission.briefings.map((briefing) => briefing.role), ROLES, "crew briefings", "$/crewMission/briefings");
  const observations = new Map([
    ["pathfinder", "mappedRoute"],
    ["engineer", "structurallySoundRoute"],
    ["containment", "hazardClearRoute"],
    ["quartermaster", "extractionWindow"],
  ]);
  for (const role of mission.roles) {
    invariant(role.privateObservationKind === observations.get(role.role), "ROLE_RELABEL", `${role.role} observation kind drifted`, "$/crewMission/roles");
  }
  exactSet(mission.routes.map((route) => route.id), ROUTES, "mission routes", "$/crewMission/routes");
  for (const briefing of mission.briefings) {
    invariant(briefing.disclosure === "private-until-signed-handoff", "BRIEFING_LEAK", "briefing disclosure boundary widened", "$/crewMission/briefings");
    if (briefing.role === "quartermaster") {
      invariant(briefing.recommendedRoute === null, "ROLE_RELABEL", "quartermaster cannot fabricate route corroboration", "$/crewMission/briefings");
    } else {
      invariant(ROUTES.includes(briefing.recommendedRoute), "UNKNOWN_ROUTE", "briefing route is undeclared", "$/crewMission/briefings");
    }
  }

  const roomIds = collectIds(mission.topology.rooms, "room", "$/crewMission/topology/rooms");
  collectIds(mission.topology.edges, "edge", "$/crewMission/topology/edges");
  invariant(roomIds.has(mission.topology.entryRoom), "UNKNOWN_ROOM", "entry room is undeclared", "$/crewMission/topology/entryRoom");
  invariant(roomIds.has(mission.topology.extractionRoom), "UNKNOWN_ROOM", "extraction room is undeclared", "$/crewMission/topology/extractionRoom");
  for (const edge of mission.topology.edges) {
    invariant(roomIds.has(edge.from), "DANGLING_EDGE", `edge ${edge.id} starts at undeclared room`, "$/crewMission/topology/edges");
    invariant(roomIds.has(edge.to), "DANGLING_EDGE", `edge ${edge.id} ends at undeclared room`, "$/crewMission/topology/edges");
  }
  invariant(findPath(mission.topology.edges, mission.topology.entryRoom, 0, mission.topology.extractionRoom) !== null, "EXTRACTION_UNREACHABLE", "entry cannot reach extraction under phase semantics", "$/crewMission/topology");

  const encounterIds = collectIds(mission.encounters, "encounter", "$/crewMission/encounters");
  const artifactIds = collectIds(mission.artifacts, "artifact", "$/crewMission/artifacts");
  const routeById = new Map(mission.routes.map((route) => [route.id, route]));
  const encounterById = new Map(mission.encounters.map((encounter) => [encounter.id, encounter]));
  for (const artifact of mission.artifacts) {
    invariant(artifact.interpretation === null, "DIRECT_ALPHA", `artifact ${artifact.id} invents an interpretation`, "$/crewMission/artifacts");
  }
  for (const route of mission.routes) {
    invariant(route.encounterIds.length >= 2 && new Set(route.encounterIds).size === route.encounterIds.length, "ROUTE_ENCOUNTERS", `route ${route.id} needs unique encounters`, "$/crewMission/routes");
    const authoredBeatCount = route.encounterIds.length + 4;
    invariant(
      authoredBeatCount >= 6 && authoredBeatCount <= 9,
      "NIGHT_WATCH_LENGTH",
      `route ${route.id} yields ${authoredBeatCount} authored beats; expected 6-9`,
      "$/crewMission/routes",
    );
    for (const encounterId of route.encounterIds) {
      invariant(encounterIds.has(encounterId), "UNKNOWN_ENCOUNTER", `route ${route.id} names ${encounterId}`, "$/crewMission/routes");
      invariant(encounterById.get(encounterId).routeIds.includes(route.id), "ASYMMETRIC_ROUTE", `route ${route.id} and encounter ${encounterId} disagree`, "$/crewMission/routes");
    }
    deriveRoutePath(pack, route);
  }
  for (const encounter of mission.encounters) {
    invariant(roomIds.has(encounter.roomId), "UNKNOWN_ROOM", `encounter ${encounter.id} names unknown room`, "$/crewMission/encounters");
    invariant(encounter.routeIds.length > 0 && new Set(encounter.routeIds).size === encounter.routeIds.length, "ENCOUNTER_ROUTES", `encounter ${encounter.id} route ids must be unique`, "$/crewMission/encounters");
    for (const routeId of encounter.routeIds) {
      invariant(routeById.has(routeId), "UNKNOWN_ROUTE", `encounter ${encounter.id} names ${routeId}`, "$/crewMission/encounters");
      invariant(routeById.get(routeId).encounterIds.includes(encounter.id), "ASYMMETRIC_ROUTE", `encounter ${encounter.id} and route ${routeId} disagree`, "$/crewMission/encounters");
    }
    for (const artifact of encounter.betaArtifactIds) {
      invariant(artifactIds.has(artifact), "UNKNOWN_ARTIFACT", `encounter ${encounter.id} names ${artifact}`, "$/crewMission/encounters");
    }
  }

  const relicIds = collectIds(pack.relicCandidates, "relic", "$/relicCandidates");
  for (const relic of pack.relicCandidates) {
    invariant(encounterIds.has(relic.sourceEncounterId), "UNKNOWN_ENCOUNTER", `relic ${relic.id} source is undeclared`, "$/relicCandidates");
    invariant(relic.marketEligible === false, "RELIC_MARKET", `relic ${relic.id} cannot be market eligible`, "$/relicCandidates");
    invariant(relic.interpretation === null, "DIRECT_ALPHA", `relic ${relic.id} invents an interpretation`, "$/relicCandidates");
  }
  validateContribution(pack.maintenanceProcedure.semanticOutput, mission.contributionBudget, relicIds, "$/maintenanceProcedure/semanticOutput");

  invariant(mission.routeOutcomes.length === ROUTES.length * EXTRACTIONS.length, "OUTCOME_PRODUCT", "route outcomes must cover exact route/extraction product", "$/crewMission/routeOutcomes");
  const outcomeKeys = new Set();
  for (const outcome of mission.routeOutcomes) {
    const key = `${outcome.route}:${outcome.extraction}`;
    invariant(!outcomeKeys.has(key), "DUPLICATE_OUTCOME", `duplicate outcome ${key}`, "$/crewMission/routeOutcomes");
    outcomeKeys.add(key);
    const deep = outcome.extraction === "descendFurther";
    invariant(outcome.requiredAgreement === (deep ? "full-crew-unanimity" : "two-specialist-route-support"), "AGREEMENT_RULE", `${key} agreement rule drifted`, "$/crewMission/routeOutcomes");
    invariant(outcome.operationalCost + (deep ? 6 : 3) <= mission.operationalBudget, "UNWINNABLE", `${key} exceeds operational budget`, "$/crewMission/routeOutcomes");
    invariant(routeById.get(outcome.route).encounterIds.length + (deep ? 2 : 1) <= mission.turnBudget, "UNWINNABLE", `${key} exceeds turn budget`, "$/crewMission/routeOutcomes");
    invariant(artifactIds.has(outcome.featuredArtifactId), "UNKNOWN_ARTIFACT", `${key} featured artifact is undeclared`, "$/crewMission/routeOutcomes");
    invariant(outcome.recoveryConsequence.implementationState === "content-draft-not-yet-semantic", "RECOVERY_OVERCLAIM", `${key} recovery overclaims runtime semantics`, "$/crewMission/routeOutcomes");
    validateContribution(outcome.contribution, mission.contributionBudget, relicIds, `$/crewMission/routeOutcomes/${key}/contribution`);
    if (!deep) invariant(outcome.contribution.relicIds.length === 0, "RELIC_CUSTODY", "safe return cannot issue relic custody", "$/crewMission/routeOutcomes");
  }
  for (const route of ROUTES) for (const extraction of EXTRACTIONS) {
    invariant(outcomeKeys.has(`${route}:${extraction}`), "OUTCOME_PRODUCT", `missing ${route}:${extraction}`, "$/crewMission/routeOutcomes");
  }
  invariant(
    mission.routeOutcomes.some((outcome) => outcome.recoveryConsequence.grade === "injured"),
    "MISSING_INJURY_RECOVERY",
    "at least one authored outcome must exercise bounded injury and recovery",
    "$/crewMission/routeOutcomes",
  );

  const candidateRefs = new Set([...placeIds, ...artifactIds, ...relicIds]);
  collectIds(pack.promotionHooks, "promotion hook", "$/promotionHooks");
  for (const hook of pack.promotionHooks) {
    invariant(candidateRefs.has(hook.candidateRef), "UNKNOWN_CANDIDATE", `hook ${hook.id} candidate is undeclared`, "$/promotionHooks");
    invariant(hook.alphaValue === null, "AUTOMATIC_PROMOTION", `hook ${hook.id} self-promotes`, "$/promotionHooks");
  }

  return {
    crossReferenceGrade: "dependency-free-authoring-validation-v1",
    routePaths: Object.fromEntries(mission.routes.map((route) => [route.id, deriveRoutePath(pack, route)])),
    counts: {
      rooms: roomIds.size,
      edges: mission.topology.edges.length,
      routes: mission.routes.length,
      encounters: encounterIds.size,
      outcomes: mission.routeOutcomes.length,
      artifacts: artifactIds.size,
      relics: relicIds.size,
    },
  };
}

export function validatePack(pack, schema) {
  const schemaReport = validateSchema(pack, schema);
  const cross = validateCrossReferences(pack);
  return {
    schema: PACK_SCHEMA,
    accepted: true,
    contentRoot: contentRoot(pack),
    schemaRoot: contentRoot(schema),
    normalizedByteLength: canonicalBytes(pack).length,
    schemaValidation: schemaReport,
    crossReferenceValidation: cross,
    leanValidation: {
      grade: "not-invoked-no-json-decoder-or-export",
      accepted: null,
      jsonInvocationAvailable: false,
      moduleGateCommand: CONTENT_CONTRACT_MODULE_GATE,
      futureJsonGateCommand: FUTURE_JSON_LEAN_GATE,
    },
  };
}

export function selectDailyRotation(pack, finalizedDay) {
  invariant(
    Number.isSafeInteger(finalizedDay) && finalizedDay >= 1,
    "FINALIZED_DAY",
    "finalized day must be a positive safe integer",
    "$/finalizedDay",
  );
  invariant(
    Array.isArray(pack.commonsRotations) && pack.commonsRotations.length > 0,
    "ROTATION_DEPTH",
    "at least one Galley rotation is required",
    "$/commonsRotations",
  );
  return pack.commonsRotations[(finalizedDay - 1) % pack.commonsRotations.length];
}

export function buildNightWatchJourney(pack, schema, options) {
  const report = validatePack(pack, schema);
  exactObjectKeys(
    options,
    ["choiceId", "extraction", "finalizedDay", "routeId", "servingAvailable"],
    "NIGHT_WATCH_OPTIONS",
    "$/options",
  );
  invariant(
    typeof options.servingAvailable === "boolean",
    "NIGHT_WATCH_OPTIONS",
    "servingAvailable must be boolean",
    "$/options/servingAvailable",
  );
  const rotation = selectDailyRotation(pack, options.finalizedDay);
  const choice = rotation.choices.find((item) => item.id === options.choiceId);
  invariant(
    choice !== undefined,
    "UNKNOWN_COMMONS_CHOICE",
    `choice ${options.choiceId} is not offered on finalized day ${options.finalizedDay}`,
    "$/options/choiceId",
  );
  const route = pack.crewMission.routes.find((item) => item.id === options.routeId);
  invariant(
    route !== undefined,
    "UNKNOWN_ROUTE",
    `route ${options.routeId} is undeclared`,
    "$/options/routeId",
  );
  invariant(
    EXTRACTIONS.includes(options.extraction),
    "UNKNOWN_EXTRACTION",
    `extraction ${options.extraction} is undeclared`,
    "$/options/extraction",
  );
  const outcome = pack.crewMission.routeOutcomes.find(
    (item) => item.route === route.id && item.extraction === options.extraction,
  );
  invariant(outcome !== undefined, "OUTCOME_PRODUCT", "selected route outcome is missing");
  const encounters = route.encounterIds.map((encounterId) =>
    pack.crewMission.encounters.find((encounter) => encounter.id === encounterId));
  const featuredArtifact = pack.crewMission.artifacts.find(
    (artifact) => artifact.id === outcome.featuredArtifactId,
  );
  invariant(featuredArtifact !== undefined, "UNKNOWN_ARTIFACT", "featured artifact is missing");
  const promotionRefs = new Set([outcome.featuredArtifactId, ...outcome.contribution.relicIds]);
  const promotionHooks = pack.promotionHooks
    .filter((hook) => promotionRefs.has(hook.candidateRef))
    .map((hook) => hook.id);

  const beats = [
    {
      kind: "galley-commons",
      id: rotation.id,
      sceneCopy: rotation.sceneCopy,
      choice: {
        id: choice.id,
        workingLabel: choice.workingLabel,
        provisioningTag: choice.provisioningTag,
        localService: choice.localService,
        resultCopy: options.servingAvailable ? choice.servedCopy : choice.alternativeCopy,
        featuredServingReceived: options.servingAvailable,
      },
      gameplayContribution: null,
    },
    {
      kind: "galley-maintenance",
      id: pack.maintenanceProcedure.id,
      taskCopy: pack.maintenanceProcedure.taskCopy,
      orderedProcedure: pack.maintenanceProcedure.procedure.map((step) => ({
        id: step.id,
        verb: step.verb,
        prompt: step.prompt,
        completionCue: step.completionCue,
        outOfOrderCue: step.outOfOrderCue,
      })),
      successCopy: pack.maintenanceProcedure.successCopy,
      failureCopy: pack.maintenanceProcedure.failureCopy,
      successContribution: pack.maintenanceProcedure.semanticOutput,
    },
    {
      kind: "crew-handoff",
      id: `${pack.crewMission.id}-handoff`,
      roles: pack.crewMission.roles.map((role) => ({
        role: role.role,
        playerQuestion: role.playerQuestion,
        surveyCommand: role.surveyCommand,
        salvageCommand: role.salvageCommand,
      })),
      disclosure: "private-until-signed-handoff",
      safeReturnRule: pack.crewMission.decisionRules.safeReturn,
      deepRecoveryRule: pack.crewMission.decisionRules.deepRecovery,
    },
    ...encounters.map((encounter) => ({
      kind: "deck-encounter",
      id: encounter.id,
      workingName: encounter.workingName,
      roomId: encounter.roomId,
      engineBinding: encounter.engineBinding,
      mechanicalClass: encounter.mechanicalClass,
      choicePrompt: encounter.playerDecision,
      onSuccess: encounter.successEffect,
      onFailure: encounter.failureEffect,
      betaEvidenceIds: encounter.betaArtifactIds,
    })),
    {
      kind: "debrief",
      id: `${route.id}-${options.extraction}-debrief`,
      featuredEvidence: {
        id: featuredArtifact.id,
        workingName: featuredArtifact.workingName,
        visibility: featuredArtifact.visibility,
        mechanicalFact: featuredArtifact.mechanicalFact,
        interpretation: null,
        archiveHint: featuredArtifact.archiveHint,
      },
      operationalCost: outcome.operationalCost,
      contribution: outcome.contribution,
      recovery: outcome.recoveryConsequence,
      promotion: {
        status: "beta-candidate-only",
        automatic: false,
        authority: "sentyr-explicit-curator-action",
        hookIds: promotionHooks,
      },
    },
  ];
  invariant(
    beats.length >= 6 && beats.length <= 9,
    "NIGHT_WATCH_LENGTH",
    `selected journey yields ${beats.length} beats; expected 6-9`,
  );

  return {
    schema: NIGHT_WATCH_SCHEMA,
    sourceContentRoot: report.contentRoot,
    finalizedDay: options.finalizedDay,
    selection: {
      rotationId: rotation.id,
      choiceId: choice.id,
      servingAvailable: options.servingAvailable,
      routeId: route.id,
      extraction: options.extraction,
    },
    access: {
      walletRequired: false,
      tokenHoldingRequired: false,
      holderGameplayMultiplier: 1,
      nonHolderGameplayMultiplier: 1,
    },
    canon: {
      tier: "beta",
      authoritative: false,
      automaticPromotion: false,
      alphaAuthority: "sentyr-explicit-curator-action",
    },
    beats,
  };
}

function idMap(values) {
  const sorted = [...new Set(values)].sort(byteCompare);
  return {
    map: new Map(sorted.map((value, index) => [value, index])),
    commitments: sorted.map((value, wireId) => ({ wireId, sourceIdHash: sha256Bytes(Buffer.from(value, "utf8")) })),
  };
}

const ROLE_CODE = new Map(ROLES.map((role, index) => [role, index]));
const OBSERVATION_CODE = new Map([
  ["mappedRoute", 0],
  ["structurallySoundRoute", 1],
  ["hazardClearRoute", 2],
  ["extractionWindow", 3],
]);
const MODIFIER_CODE = new Map([
  ["oneWay", 0],
  ["wrapHorizontal", 1],
  ["wrapVertical", 2],
  ["mirrorVertical", 3],
  ["phase0to1", 4],
]);

export function makeWireFixture(pack, schema) {
  const report = validatePack(pack, schema);
  const mission = pack.crewMission;
  const rooms = idMap(mission.topology.rooms.map((room) => room.id));
  const edges = idMap(mission.topology.edges.map((edge) => edge.id));
  const routes = idMap(mission.routes.map((route) => route.id));
  const encounters = idMap(mission.encounters.map((encounter) => encounter.id));
  const artifacts = idMap(mission.artifacts.map((artifact) => artifact.id));
  const relics = idMap(pack.relicCandidates.map((relic) => relic.id));
  const recoveries = idMap(mission.routeOutcomes.map((outcome) => `${outcome.recoveryConsequence.grade}\0${outcome.recoveryConsequence.duration}`));
  const encounterById = new Map(mission.encounters.map((encounter) => [encounter.id, encounter]));
  const relicById = new Map(pack.relicCandidates.map((relic) => [relic.id, relic]));
  const recoveryGradeCodes = idMap(mission.routeOutcomes.map((outcome) => outcome.recoveryConsequence.grade)).map;
  const recoveryDurationCodes = idMap(mission.routeOutcomes.map((outcome) => outcome.recoveryConsequence.duration)).map;
  const raw = {
    schemaVersion: 1,
    place: 0,
    deck: {
      rooms: mission.topology.rooms.map((room) => rooms.map.get(room.id)),
      edges: mission.topology.edges.map((edge) => ({
        id: edges.map.get(edge.id),
        source: rooms.map.get(edge.from),
        destination: rooms.map.get(edge.to),
        modifier: MODIFIER_CODE.get(edge.modifier),
      })),
      entry: rooms.map.get(mission.topology.entryRoom),
      extraction: rooms.map.get(mission.topology.extractionRoom),
      initialPhase: 0,
      navigationFuel: Math.min(64, mission.topology.edges.length),
      validationFuel: Math.min(4096, Math.max(1, mission.topology.rooms.length * 4)),
    },
    officers: mission.roles.map((role, index) => ({ officer: index, credential: index, role: ROLE_CODE.get(role.role) })),
    briefings: mission.briefings.map((briefing) => ({
      role: ROLE_CODE.get(briefing.role),
      observation: OBSERVATION_CODE.get(mission.roles.find((role) => role.role === briefing.role).privateObservationKind),
      recommendedRoute: briefing.recommendedRoute === null ? null : routes.map.get(briefing.recommendedRoute),
      disclosure: 0,
    })),
    routes: mission.routes.map((route) => ({
      id: routes.map.get(route.id),
      encounters: route.encounterIds.map((id) => encounters.map.get(id)),
      path: deriveRoutePath(pack, route).edgeIds.map((id) => edges.map.get(id)),
    })),
    encounters: mission.encounters.map((encounter) => ({
      id: encounters.map.get(encounter.id),
      room: rooms.map.get(encounter.roomId),
      routes: encounter.routeIds.map((id) => routes.map.get(id)),
      betaArtifacts: encounter.betaArtifactIds.map((id) => artifacts.map.get(id)),
    })),
    artifacts: mission.artifacts.map((artifact) => ({ id: artifacts.map.get(artifact.id), alphaInterpretation: null })),
    outcomes: mission.routeOutcomes.map((outcome) => ({
      route: routes.map.get(outcome.route),
      extraction: outcome.extraction === "returnNow" ? 0 : 1,
      operationalCost: outcome.operationalCost,
      agreement: outcome.requiredAgreement === "two-specialist-route-support" ? 0 : 1,
      featuredArtifact: artifacts.map.get(outcome.featuredArtifactId),
      contribution: {
        intel: outcome.contribution.intel,
        supplies: outcome.contribution.supplies,
        cohesion: outcome.contribution.cohesion,
        influence: outcome.contribution.influence,
        score: outcome.contribution.score,
        relics: outcome.contribution.relicIds.map((id) => relics.map.get(id)),
      },
      recovery: recoveries.map.get(`${outcome.recoveryConsequence.grade}\0${outcome.recoveryConsequence.duration}`),
    })),
    recoveries: [...recoveries.map.entries()].map(([key, id]) => {
      const [grade, duration] = key.split("\0");
      return {
        id,
        grade: recoveryGradeCodes.get(grade),
        duration: recoveryDurationCodes.get(duration),
        implementation: 0,
        globalMeterDebit: 0,
      };
    }),
    relics: pack.relicCandidates.map((relic) => ({
      id: relics.map.get(relic.id),
      sourceEncounter: encounters.map.get(relic.sourceEncounterId),
      portable: relic.portable,
      marketEligible: false,
      alphaInterpretation: null,
    })),
    custodyPlans: pack.relicCandidates.map((relic) => ({
      relic: relics.map.get(relic.id),
      source: { atEncounter: encounters.map.get(relic.sourceEncounterId) },
      destination: relic.portable ? "quarantine" : "archive",
      authority: "fullCrewUnanimity",
      directTradeAllowed: false,
    })),
    promotionHooks: [],
    turnBudget: mission.turnBudget,
    operationalBudget: mission.operationalBudget,
    contributionBudget: {
      ...Object.fromEntries(METERS.map((meter) => [meter, mission.contributionBudget[meter]])),
      relicAllowlist: mission.contributionBudget.relicIds.map((id) => relics.map.get(id)),
    },
    canon: {
      tier: "betaDraft",
      authoritative: false,
      claimsActivated: false,
      automaticPromotion: false,
      authority: "explicitCuratorAction",
      directAlphaFacts: [],
    },
  };
  return {
    schema: WIRE_SCHEMA,
    sourceContentRoot: report.contentRoot,
    sourceSchemaRoot: report.schemaRoot,
    grade: "wire-ready-not-lean-validated",
    leanValidation: report.leanValidation,
    opaqueIdCommitments: {
      rooms: rooms.commitments,
      edges: edges.commitments,
      routes: routes.commitments,
      encounters: encounters.commitments,
      artifacts: artifacts.commitments,
      relics: relics.commitments,
    },
    rawContent: raw,
  };
}

export function makePublicBundle(pack, schema) {
  const wire = makeWireFixture(pack, schema);
  const { promotionHooks: _privatePromotionHooks, ...publicMechanics } = wire.rawContent;
  return {
    schema: PUBLIC_SCHEMA,
    sourceContentRoot: wire.sourceContentRoot,
    sourceSchemaRoot: wire.sourceSchemaRoot,
    status: {
      tier: "beta",
      authoritative: false,
      automaticPromotion: false,
      spoilersRedacted: true,
    },
    validationGrade: wire.grade,
    leanJsonValidation: wire.leanValidation,
    mechanics: publicMechanics,
  };
}

export function previewPack(pack, schema) {
  validatePack(pack, schema);
  const lines = [
    `# ${pack.packId} — private operator preview`,
    "",
    "Authoring/schema validation: PASS",
    "Lean JSON validation: NOT INVOKED (JSON decoder/export unavailable)",
    "Alpha canon: no automatic promotion; explicit curator successor required",
    "",
    "## Routes and outcomes",
    "",
  ];
  for (const route of pack.crewMission.routes) {
    lines.push(`### ${route.workingName} (${route.id})`, "");
    lines.push(`Encounters: ${route.encounterIds.join(", ")}`);
    const path = deriveRoutePath(pack, route);
    lines.push(`Directed extraction path: ${path.edgeIds.join(" -> ")} (phase ${path.finalPhase})`);
    for (const outcome of pack.crewMission.routeOutcomes.filter((item) => item.route === route.id)) {
      lines.push(
        `- ${outcome.extraction}: cost ${outcome.operationalCost}; agreement ${outcome.requiredAgreement}; score ${outcome.contribution.score}; relics ${outcome.contribution.relicIds.join(", ") || "none"}; recovery ${outcome.recoveryConsequence.grade}`,
      );
    }
    lines.push("");
  }
  lines.push("## Beta candidates", "");
  for (const artifact of pack.crewMission.artifacts) {
    lines.push(`- artifact ${artifact.id} (${artifact.workingName}): ${artifact.visibility}`);
  }
  for (const relic of pack.relicCandidates) {
    lines.push(`- relic ${relic.id} (${relic.workingName}): portable=${relic.portable}; market=false`);
  }
  lines.push(
    "",
    "Promotion hooks and Sentyr-only questions are intentionally omitted from this preview.",
  );
  return `${lines.join("\n")}\n`;
}

function diffRecursive(left, right, path, changes) {
  if (canonicalJson(left) === canonicalJson(right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length) changes.push({ kind: "added", path: `${path}/${index}` });
      else if (index >= right.length) changes.push({ kind: "removed", path: `${path}/${index}` });
      else diffRecursive(left[index], right[index], `${path}/${index}`, changes);
    }
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(byteCompare);
    for (const key of keys) {
      const childPath = `${path}/${escapePointer(key)}`;
      if (!Object.hasOwn(left, key)) changes.push({ kind: "added", path: childPath });
      else if (!Object.hasOwn(right, key)) changes.push({ kind: "removed", path: childPath });
      else diffRecursive(left[key], right[key], childPath, changes);
    }
    return;
  }
  changes.push({ kind: "changed", path });
}

export function diffPacks(left, right) {
  const changes = [];
  diffRecursive(left, right, "$", changes);
  return {
    schema: "POA-PACK-DIFF-V1",
    fromContentRoot: contentRoot(left),
    toContentRoot: contentRoot(right),
    changeCount: changes.length,
    changes,
  };
}

function publicKeyId(publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  return sha256Bytes(der);
}

async function loadPrivateKey(path) {
  invariant(typeof path === "string" && path.length > 0, "KEY_REQUIRED", "explicit signing key path is required");
  const bytes = await readFile(path);
  let key;
  try {
    key = createPrivateKey(bytes);
  } catch (error) {
    fail("PRIVATE_KEY", `cannot parse explicit private key: ${error.message}`, path);
  }
  invariant(key.asymmetricKeyType === "ed25519", "PRIVATE_KEY", "only Ed25519 private keys are accepted", path);
  return key;
}

async function loadPublicKey(path) {
  invariant(typeof path === "string" && path.length > 0, "PUBLIC_KEY_REQUIRED", "explicit public-key pin path is required");
  const bytes = await readFile(path);
  let key;
  try {
    key = createPublicKey(bytes);
  } catch (error) {
    fail("PUBLIC_KEY", `cannot parse public key pin: ${error.message}`, path);
  }
  invariant(key.asymmetricKeyType === "ed25519", "PUBLIC_KEY", "only Ed25519 public keys are accepted", path);
  return key;
}

function unsignedEnvelopeBytes(request) {
  return Buffer.concat([SIGNING_DOMAIN, canonicalBytes(request)]);
}

function validateRequestShape(request) {
  exactObjectKeys(
    request,
    [
      "schema",
      "mode",
      "packSchemaVersion",
      "schemaRoot",
      "packIdCommitment",
      "contentRoot",
      "normalizedByteLength",
      "publicBundleRoot",
      "wireFixtureRoot",
      "contentEpoch",
      "activationCounter",
      "predecessor",
      "rollbackTarget",
      "validationGrade",
    ],
    "REQUEST_SHAPE",
  );
  invariant(request?.schema === REQUEST_SCHEMA, "REQUEST_SCHEMA", "wrong request schema");
  invariant(request.packSchemaVersion === CURRENT_SCHEMA_VERSION, "REQUEST_SCHEMA", "wrong pack schema version");
  invariant(SHA256.test(request.contentRoot), "REQUEST_ROOT", "invalid content root");
  invariant(SHA256.test(request.schemaRoot), "REQUEST_ROOT", "invalid schema root");
  invariant(SHA256.test(request.packIdCommitment), "REQUEST_ROOT", "invalid pack id commitment");
  invariant(SHA256.test(request.publicBundleRoot), "REQUEST_ROOT", "invalid public bundle root");
  invariant(SHA256.test(request.wireFixtureRoot), "REQUEST_ROOT", "invalid wire fixture root");
  invariant(Number.isSafeInteger(request.normalizedByteLength) && request.normalizedByteLength > 0, "REQUEST_LENGTH", "normalized byte length must be positive");
  exactObjectKeys(
    request.validationGrade,
    ["schemaAndCrossReferences", "leanJson"],
    "REQUEST_GRADE",
    "$/validationGrade",
  );
  invariant(request.validationGrade.schemaAndCrossReferences === "passed", "REQUEST_GRADE", "schema/cross-reference grade must be passed");
  invariant(request.validationGrade.leanJson === "not-invoked-no-json-decoder-or-export", "REQUEST_GRADE", "Lean JSON grade cannot be widened");
  invariant(Number.isSafeInteger(request.contentEpoch) && request.contentEpoch > 0, "REQUEST_EPOCH", "content epoch must be positive");
  invariant(Number.isSafeInteger(request.activationCounter) && request.activationCounter > 0, "REQUEST_COUNTER", "activation counter must be positive");
  invariant(["genesis", "successor", "rollback"].includes(request.mode), "REQUEST_MODE", "invalid activation mode");
  if (request.mode === "genesis") {
    invariant(request.activationCounter === 1, "COUNTER_SKIP", "genesis counter must be 1");
    invariant(request.predecessor === null, "REQUEST_MODE", "genesis cannot name predecessor");
    invariant(request.rollbackTarget === null, "REQUEST_MODE", "genesis cannot name rollback target");
    return;
  }
  invariant(request.predecessor && typeof request.predecessor === "object", "PREDECESSOR_REQUIRED", "successor must name predecessor");
  exactObjectKeys(
    request.predecessor,
    ["contentRoot", "contentEpoch", "activationCounter", "envelopeRoot"],
    "PREDECESSOR_MISMATCH",
    "$/predecessor",
  );
  invariant(SHA256.test(request.predecessor.contentRoot), "PREDECESSOR_MISMATCH", "invalid predecessor content root");
  invariant(SHA256.test(request.predecessor.envelopeRoot), "PREDECESSOR_MISMATCH", "invalid predecessor envelope root");
  invariant(request.activationCounter === request.predecessor.activationCounter + 1, "COUNTER_SKIP", "request counter is not exact predecessor successor");
  invariant(
    request.contentEpoch === request.predecessor.contentEpoch ||
      request.contentEpoch === request.predecessor.contentEpoch + 1,
    "EPOCH_SKIP",
    "request epoch must stay or advance exactly one",
  );
  if (request.mode === "successor") {
    invariant(request.rollbackTarget === null, "REQUEST_MODE", "ordinary successor cannot name rollback target");
    invariant(request.contentRoot !== request.predecessor.contentRoot, "NOOP_SUCCESSOR", "successor must change content root");
    return;
  }
  invariant(request.rollbackTarget && typeof request.rollbackTarget === "object", "ROLLBACK_TARGET", "rollback request must name historical target");
  exactObjectKeys(
    request.rollbackTarget,
    ["contentRoot", "contentEpoch", "historicalActivationCounter", "envelopeRoot"],
    "ROLLBACK_TARGET",
    "$/rollbackTarget",
  );
  invariant(request.rollbackTarget.contentRoot === request.contentRoot, "ROLLBACK_ROOT", "rollback target must equal requested content root");
  invariant(request.rollbackTarget.historicalActivationCounter < request.predecessor.activationCounter, "ROLLBACK_TARGET", "rollback target must precede predecessor");
  invariant(SHA256.test(request.rollbackTarget.envelopeRoot), "ROLLBACK_TARGET", "invalid rollback envelope root");
}

async function validateExternalLineage(request, options = {}) {
  validateRequestShape(request);
  if (request.mode === "genesis") return;
  invariant(options.previousEnvelope && options.previousPublicKeyPath, "PREDECESSOR_REQUIRED", "signing successor requires previous envelope and external public-key pin");
  await verifyEnvelope(options.previousEnvelope, options.previousPublicKeyPath);
  const previous = options.previousEnvelope.request;
  invariant(request.predecessor.envelopeRoot === contentRoot(options.previousEnvelope), "PREDECESSOR_MISMATCH", "request predecessor envelope root drifted");
  invariant(request.predecessor.contentRoot === previous.contentRoot, "PREDECESSOR_MISMATCH", "request predecessor content root drifted");
  invariant(request.predecessor.activationCounter === previous.activationCounter, "PREDECESSOR_MISMATCH", "request predecessor counter drifted");
  invariant(request.predecessor.contentEpoch === previous.contentEpoch, "PREDECESSOR_MISMATCH", "request predecessor epoch drifted");
  if (request.mode === "rollback") {
    invariant(options.rollbackTargetEnvelope && options.rollbackTargetPublicKeyPath, "ROLLBACK_PIN_REQUIRED", "signing rollback requires historical target envelope and external key pin");
    await verifyEnvelope(options.rollbackTargetEnvelope, options.rollbackTargetPublicKeyPath);
    const target = options.rollbackTargetEnvelope.request;
    invariant(request.rollbackTarget.envelopeRoot === contentRoot(options.rollbackTargetEnvelope), "ROLLBACK_TARGET", "request rollback envelope root drifted");
    invariant(request.rollbackTarget.contentRoot === target.contentRoot, "ROLLBACK_TARGET", "request rollback content root drifted");
    invariant(request.rollbackTarget.historicalActivationCounter === target.activationCounter, "ROLLBACK_TARGET", "request rollback counter drifted");
  }
}

export async function verifyEnvelope(envelope, publicKeyPath, pack = null, schema = null) {
  exactObjectKeys(
    envelope,
    ["schema", "request", "algorithm", "keyId", "signature"],
    "ENVELOPE_SHAPE",
  );
  invariant(envelope?.schema === ENVELOPE_SCHEMA, "ENVELOPE_SCHEMA", "wrong envelope schema");
  validateRequestShape(envelope.request);
  invariant(envelope.algorithm === "Ed25519", "SIGNATURE_ALGORITHM", "algorithm must be Ed25519");
  invariant(SHA256.test(envelope.keyId), "WRONG_KEY", "key id must be canonical SHA-256");
  invariant(typeof envelope.signature === "string" && B64URL.test(envelope.signature), "SIGNATURE_ENCODING", "signature must be base64url");
  const publicKey = await loadPublicKey(publicKeyPath);
  invariant(envelope.keyId === publicKeyId(publicKey), "WRONG_KEY", "envelope key id differs from external pin");
  const signature = Buffer.from(envelope.signature, "base64url");
  invariant(signature.length === 64, "SIGNATURE_ENCODING", "Ed25519 signature must be 64 bytes");
  invariant(cryptoVerify(null, unsignedEnvelopeBytes(envelope.request), publicKey, signature), "WRONG_SIGNATURE", "signature verification failed");
  if (pack !== null) {
    invariant(schema !== null, "SCHEMA_REQUIRED", "schema is required when checking pack root");
    validatePack(pack, schema);
    const publicBundle = makePublicBundle(pack, schema);
    const wire = makeWireFixture(pack, schema);
    invariant(envelope.request.packSchemaVersion === pack.schemaVersion, "WRONG_ROOT", "envelope pack schema version drifted");
    invariant(envelope.request.packIdCommitment === sha256Bytes(Buffer.from(pack.packId, "utf8")), "WRONG_ROOT", "envelope pack id commitment drifted");
    invariant(envelope.request.contentRoot === contentRoot(pack), "WRONG_ROOT", "envelope names a different pack root");
    invariant(envelope.request.schemaRoot === contentRoot(schema), "WRONG_ROOT", "envelope names a different schema root");
    invariant(envelope.request.normalizedByteLength === canonicalBytes(pack).length, "WRONG_ROOT", "envelope normalized byte length drifted");
    invariant(envelope.request.publicBundleRoot === contentRoot(publicBundle), "WRONG_ROOT", "envelope names a different public bundle root");
    invariant(envelope.request.wireFixtureRoot === contentRoot(wire), "WRONG_ROOT", "envelope names a different wire fixture root");
  }
  return {
    verified: true,
    keyId: envelope.keyId,
    requestRoot: contentRoot(envelope.request),
    envelopeRoot: contentRoot(envelope),
  };
}

export async function createActivationRequest(pack, schema, options) {
  const report = validatePack(pack, schema);
  const epoch = Number(options.epoch);
  const counter = Number(options.counter);
  invariant(Number.isSafeInteger(epoch) && epoch > 0, "REQUEST_EPOCH", "epoch must be positive");
  invariant(Number.isSafeInteger(counter) && counter > 0, "REQUEST_COUNTER", "counter must be positive");
  const publicBundle = makePublicBundle(pack, schema);
  const wire = makeWireFixture(pack, schema);
  let mode;
  let predecessor = null;
  let rollbackTarget = null;
  if (options.genesis) {
    invariant(!options.previousEnvelope, "REQUEST_MODE", "genesis cannot name predecessor");
    invariant(!options.rollbackTargetEnvelope, "REQUEST_MODE", "genesis cannot be rollback");
    invariant(counter === 1, "COUNTER_SKIP", "genesis activation counter must be 1");
    mode = "genesis";
  } else {
    invariant(options.previousEnvelope && options.previousPublicKeyPath, "PREDECESSOR_REQUIRED", "successor requires previous envelope and external public-key pin");
    await verifyEnvelope(options.previousEnvelope, options.previousPublicKeyPath);
    const previous = options.previousEnvelope.request;
    invariant(counter === previous.activationCounter + 1, "COUNTER_SKIP", `counter must be exact successor ${previous.activationCounter + 1}`);
    invariant(epoch === previous.contentEpoch || epoch === previous.contentEpoch + 1, "EPOCH_SKIP", "epoch must stay or advance exactly one");
    predecessor = {
      contentRoot: previous.contentRoot,
      contentEpoch: previous.contentEpoch,
      activationCounter: previous.activationCounter,
      envelopeRoot: contentRoot(options.previousEnvelope),
    };
    if (options.rollbackTargetEnvelope) {
      invariant(options.rollbackTargetPublicKeyPath, "ROLLBACK_PIN_REQUIRED", "rollback target requires external public-key pin");
      await verifyEnvelope(options.rollbackTargetEnvelope, options.rollbackTargetPublicKeyPath);
      const target = options.rollbackTargetEnvelope.request;
      invariant(target.activationCounter < previous.activationCounter, "ROLLBACK_TARGET", "rollback target must precede current activation");
      invariant(report.contentRoot === target.contentRoot, "ROLLBACK_ROOT", "rollback pack must exactly match target content root");
      rollbackTarget = {
        contentRoot: target.contentRoot,
        contentEpoch: target.contentEpoch,
        historicalActivationCounter: target.activationCounter,
        envelopeRoot: contentRoot(options.rollbackTargetEnvelope),
      };
      mode = "rollback";
    } else {
      invariant(report.contentRoot !== previous.contentRoot, "NOOP_SUCCESSOR", "successor must change content root");
      mode = "successor";
    }
  }
  return {
    schema: REQUEST_SCHEMA,
    mode,
    packSchemaVersion: pack.schemaVersion,
    schemaRoot: report.schemaRoot,
    packIdCommitment: sha256Bytes(Buffer.from(pack.packId, "utf8")),
    contentRoot: report.contentRoot,
    normalizedByteLength: report.normalizedByteLength,
    publicBundleRoot: contentRoot(publicBundle),
    wireFixtureRoot: contentRoot(wire),
    contentEpoch: epoch,
    activationCounter: counter,
    predecessor,
    rollbackTarget,
    validationGrade: {
      schemaAndCrossReferences: "passed",
      leanJson: "not-invoked-no-json-decoder-or-export",
    },
  };
}

export async function signActivationRequest(request, privateKeyPath, pack, schema, lineage = {}) {
  await validateExternalLineage(request, lineage);
  validatePack(pack, schema);
  invariant(request.packSchemaVersion === pack.schemaVersion, "WRONG_ROOT", "request pack schema version drifted");
  invariant(request.packIdCommitment === sha256Bytes(Buffer.from(pack.packId, "utf8")), "WRONG_ROOT", "request pack id commitment drifted");
  invariant(request.contentRoot === contentRoot(pack), "WRONG_ROOT", "request names a different pack root");
  invariant(request.schemaRoot === contentRoot(schema), "WRONG_ROOT", "request names a different schema root");
  invariant(request.normalizedByteLength === canonicalBytes(pack).length, "WRONG_ROOT", "request normalized byte length drifted");
  invariant(request.publicBundleRoot === contentRoot(makePublicBundle(pack, schema)), "WRONG_ROOT", "request public bundle root drifted");
  invariant(request.wireFixtureRoot === contentRoot(makeWireFixture(pack, schema)), "WRONG_ROOT", "request wire fixture root drifted");
  const privateKey = await loadPrivateKey(privateKeyPath);
  const publicKey = createPublicKey(privateKey);
  return {
    schema: ENVELOPE_SCHEMA,
    request,
    algorithm: "Ed25519",
    keyId: publicKeyId(publicKey),
    signature: cryptoSign(null, unsignedEnvelopeBytes(request), privateKey).toString("base64url"),
  };
}

export async function createMigrationManifest(fromEnvelope, fromPublicKeyPath, fromPack, toEnvelope, toPublicKeyPath, toPack, schema) {
  await verifyEnvelope(fromEnvelope, fromPublicKeyPath, fromPack, schema);
  await verifyEnvelope(toEnvelope, toPublicKeyPath, toPack, schema);
  const from = fromEnvelope.request;
  const to = toEnvelope.request;
  invariant(to.activationCounter === from.activationCounter + 1, "COUNTER_SKIP", "migration target is not exact successor");
  invariant(to.predecessor?.envelopeRoot === contentRoot(fromEnvelope), "PREDECESSOR_MISMATCH", "target request does not bind source envelope");
  invariant(to.predecessor?.contentRoot === from.contentRoot, "PREDECESSOR_MISMATCH", "target request does not bind source content root");
  const rollback = to.mode === "rollback";
  if (rollback) {
    invariant(to.rollbackTarget?.contentRoot === to.contentRoot, "ROLLBACK_ROOT", "rollback target/root mismatch");
    invariant(to.rollbackTarget.historicalActivationCounter < from.activationCounter, "ROLLBACK_TARGET", "rollback target is not historical");
  }
  return {
    schema: MIGRATION_SCHEMA,
    mode: rollback ? "rollback" : "upgrade",
    from: {
      contentRoot: from.contentRoot,
      contentEpoch: from.contentEpoch,
      activationCounter: from.activationCounter,
      envelopeRoot: contentRoot(fromEnvelope),
    },
    to: {
      contentRoot: to.contentRoot,
      contentEpoch: to.contentEpoch,
      activationCounter: to.activationCounter,
      envelopeRoot: contentRoot(toEnvelope),
    },
    rollbackTarget: to.rollbackTarget,
    diff: diffPacks(fromPack, toPack),
    operatorSequence: [
      "stop-all-consumers",
      "copy-canonical-pack-and-envelope",
      "verify-external-key-pin-and-exact-roots",
      "run-schema-crossref-and-future-lean-gates",
      "atomic-pointer-swap",
      "retain-predecessor-for-recovery",
    ],
  };
}

function candidateExists(pack, kind, id) {
  if (kind === "place") return pack.recurringPlace.id === id;
  if (kind === "artifact") return pack.crewMission.artifacts.some((item) => item.id === id);
  if (kind === "relic") return pack.relicCandidates.some((item) => item.id === id);
  return false;
}

export async function createAlphaProposal(pack, schema, envelope, publicKeyPath, kind, id, alphaValueBytes) {
  await verifyEnvelope(envelope, publicKeyPath, pack, schema);
  invariant(["place", "artifact", "relic"].includes(kind), "CANDIDATE_KIND", "candidate kind must be place, artifact, or relic");
  invariant(candidateExists(pack, kind, id), "UNKNOWN_CANDIDATE", `${kind} candidate ${id} is undeclared`);
  invariant(Buffer.isBuffer(alphaValueBytes) && alphaValueBytes.length > 0, "ALPHA_VALUE", "explicit alpha value file must be nonempty");
  return {
    schema: PROPOSAL_SCHEMA,
    status: "proposal-only",
    automatic: false,
    authorityGranted: false,
    requires: "explicit-curator-successor-action",
    sourceActivation: {
      contentRoot: envelope.request.contentRoot,
      contentEpoch: envelope.request.contentEpoch,
      activationCounter: envelope.request.activationCounter,
      envelopeRoot: contentRoot(envelope),
    },
    candidate: { kind, id },
    alphaValueSha256: sha256Bytes(alphaValueBytes),
  };
}
