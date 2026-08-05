import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  canonicalBytes,
  contentRoot,
  createActivationRequest,
  createAlphaProposal,
  createMigrationManifest,
  deriveRoutePath,
  makePublicBundle,
  makeWireFixture,
  previewPack,
  signActivationRequest,
  validatePack,
  verifyEnvelope,
} from "../tools/poa-pack-lib.mjs";

const root = new URL("../", import.meta.url);
const execFileAsync = promisify(execFile);
const pack = JSON.parse(await readFile(new URL("pack.json", root), "utf8"));
const schema = JSON.parse(
  await readFile(new URL("schema/poa-beta-content-pack.schema.json", root), "utf8"),
);

function clone(value) {
  return structuredClone(value);
}

function errorCode(expected) {
  return (error) => error?.code === expected;
}

async function explicitTestKeys(directory) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePath = join(directory, "explicit-test-private.pem");
  const publicPath = join(directory, "explicit-test-public.pem");
  await writeFile(
    privatePath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    publicPath,
    publicKey.export({ type: "spki", format: "pem" }),
    { flag: "wx", mode: 0o644 },
  );
  return { privatePath, publicPath };
}

test("full dependency-free schema and cross-reference validation accepts the author pack", () => {
  const report = validatePack(pack, schema);
  assert.equal(report.accepted, true);
  assert.equal(report.schemaValidation.errorCount, 0);
  assert.equal(report.crossReferenceValidation.counts.routes, 3);
  assert.equal(report.leanValidation.grade, "not-invoked-no-json-decoder-or-export");
  assert.equal(report.leanValidation.accepted, null);
  assert.equal(report.leanValidation.jsonInvocationAvailable, false);
});

test("actual CLI validates and writes its wire output only to caller-selected temp path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poa-pack-cli-"));
  const wirePath = join(directory, "wire.json");
  const cliPath = fileURLToPath(new URL("../tools/poa-pack.mjs", import.meta.url));
  const packPath = fileURLToPath(new URL("../pack.json", import.meta.url));
  const schemaPath = fileURLToPath(
    new URL("../schema/poa-beta-content-pack.schema.json", import.meta.url),
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    cliPath,
    "validate",
    "--pack",
    packPath,
    "--schema",
    schemaPath,
    "--wire-out",
    wirePath,
  ]);
  assert.equal(stderr, "");
  const report = JSON.parse(stdout);
  assert.equal(report.accepted, true);
  assert.equal(report.wireFixture.grade, "wire-ready-not-lean-validated");
  const wire = JSON.parse(await readFile(wirePath, "utf8"));
  assert.equal(wire.sourceContentRoot, report.contentRoot);
});

test("actual CLI request, explicit-key sign, and external-pin verify ceremony round-trips", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poa-pack-cli-sign-"));
  const keys = await explicitTestKeys(directory);
  const requestPath = join(directory, "request.json");
  const envelopePath = join(directory, "envelope.json");
  const cliPath = fileURLToPath(new URL("../tools/poa-pack.mjs", import.meta.url));
  const packPath = fileURLToPath(new URL("../pack.json", import.meta.url));
  const schemaPath = fileURLToPath(
    new URL("../schema/poa-beta-content-pack.schema.json", import.meta.url),
  );
  await execFileAsync(process.execPath, [
    cliPath,
    "request",
    "--pack",
    packPath,
    "--schema",
    schemaPath,
    "--epoch",
    "1",
    "--counter",
    "1",
    "--out",
    requestPath,
    "--genesis",
    "true",
  ]);
  await execFileAsync(process.execPath, [
    cliPath,
    "sign",
    "--request",
    requestPath,
    "--pack",
    packPath,
    "--schema",
    schemaPath,
    "--key",
    keys.privatePath,
    "--out",
    envelopePath,
  ]);
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    cliPath,
    "verify",
    "--envelope",
    envelopePath,
    "--public-key",
    keys.publicPath,
    "--pack",
    packPath,
    "--schema",
    schemaPath,
  ]);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).verified, true);
});

test("canonical bytes are deterministic across object insertion order and repeated projection", () => {
  const reordered = Object.fromEntries(Object.entries(pack).reverse());
  assert.deepEqual(canonicalBytes(reordered), canonicalBytes(pack));
  assert.equal(contentRoot(reordered), contentRoot(pack));
  assert.deepEqual(
    canonicalBytes(makePublicBundle(pack, schema)),
    canonicalBytes(makePublicBundle(reordered, schema)),
  );
  assert.deepEqual(
    canonicalBytes(makeWireFixture(pack, schema)),
    canonicalBytes(makeWireFixture(reordered, schema)),
  );
});

test("every authored route traverses directed phase-aware edges to extraction", () => {
  const expected = new Map([
    ["maintenanceSpine", ["lock-to-counting", "counting-to-spine", "spine-to-bell", "bell-to-lift", "lift-to-witness"]],
    ["signalGallery", ["lock-to-counting", "counting-to-gallery", "gallery-to-cistern", "cistern-to-lift", "lift-to-witness"]],
    ["sealedNave", ["lock-to-counting", "counting-to-nave", "nave-to-cistern", "cistern-to-lift", "lift-to-witness"]],
  ]);
  for (const route of pack.crewMission.routes) {
    const result = deriveRoutePath(pack, route);
    assert.deepEqual(result.edgeIds, expected.get(route.id));
    assert.equal(result.finalPhase, 1);
  }
});

test("hostile path removal refuses a route even while other extraction paths remain", () => {
  const hostile = clone(pack);
  hostile.crewMission.topology.edges = hostile.crewMission.topology.edges.filter(
    (edge) => edge.id !== "bell-to-lift",
  );
  assert.throws(() => validatePack(hostile, schema), errorCode("ROUTE_UNREACHABLE"));
});

test("duplicate ids and asymmetric route membership refuse", () => {
  const duplicate = clone(pack);
  duplicate.crewMission.topology.rooms.push(clone(duplicate.crewMission.topology.rooms[0]));
  assert.throws(() => validatePack(duplicate, schema), errorCode("DUPLICATE_ID"));

  const asymmetric = clone(pack);
  asymmetric.crewMission.encounters[0].routeIds = ["maintenanceSpine"];
  assert.throws(() => validatePack(asymmetric, schema), errorCode("ASYMMETRIC_ROUTE"));
});

test("public bundle and route preview omit every Sentyr-only hook or sealed question", () => {
  const publicText = canonicalBytes(makePublicBundle(pack, schema)).toString("utf8");
  const preview = previewPack(pack, schema);
  const forbidden = [
    ...pack.recurringPlace.sentyrQuestions,
    ...pack.crewMission.encounters.flatMap((encounter) => encounter.sealedInterpretationQuestions),
    ...pack.relicCandidates.map((relic) => relic.sentyrQuestion),
    ...pack.promotionHooks.flatMap((hook) => [hook.betaEvidence, hook.sentyrDecision, hook.ifDeclined]),
  ];
  for (const secret of forbidden) {
    assert(!publicText.includes(secret), `public bundle leaked ${secret}`);
    assert(!preview.includes(secret), `preview leaked ${secret}`);
  }
  assert(!publicText.includes("promotionHooks"));
  const privateIds = [
    pack.packId,
    pack.recurringPlace.id,
    ...pack.crewMission.topology.rooms.map((room) => room.id),
    ...pack.crewMission.routes.map((route) => route.id),
    ...pack.crewMission.artifacts.map((artifact) => artifact.id),
    ...pack.relicCandidates.map((relic) => relic.id),
  ];
  for (const id of privateIds) {
    assert(!publicText.includes(id), `public bundle leaked private id ${id}`);
  }
  assert(!preview.includes("promote-index-film"));
  assert.match(preview, /Routes and outcomes/);
  assert.match(preview, /Beta candidates/);
});

test("non-market relic policy refuses both market eligibility and safe-return custody", () => {
  const market = clone(pack);
  market.relicCandidates[0].marketEligible = true;
  assert.throws(() => validatePack(market, schema), (error) =>
    ["SCHEMA_CONST", "RELIC_MARKET"].includes(error?.code),
  );

  const safeTrade = clone(pack);
  safeTrade.crewMission.routeOutcomes[0].contribution.relicIds = [
    safeTrade.relicCandidates[0].id,
  ];
  assert.throws(() => validatePack(safeTrade, schema), errorCode("RELIC_CUSTODY"));

  const wireText = canonicalBytes(makeWireFixture(pack, schema)).toString("utf8");
  assert(!wireText.includes('"directTradeAllowed":true'));
  assert(!wireText.includes('"marketEligible":true'));
});

test("explicit key signs exact roots; wrong signature, key, and pack root refuse", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poa-pack-sign-"));
  const keys = await explicitTestKeys(directory);
  const other = await explicitTestKeys(await mkdtemp(join(tmpdir(), "poa-pack-other-")));
  const request = await createActivationRequest(pack, schema, {
    epoch: 1,
    counter: 1,
    genesis: true,
  });
  const envelope = await signActivationRequest(
    request,
    keys.privatePath,
    pack,
    schema,
  );
  const verified = await verifyEnvelope(envelope, keys.publicPath, pack, schema);
  assert.equal(verified.verified, true);

  const badSignature = clone(envelope);
  badSignature.signature = `${badSignature.signature[0] === "A" ? "B" : "A"}${badSignature.signature.slice(1)}`;
  await assert.rejects(
    verifyEnvelope(badSignature, keys.publicPath, pack, schema),
    errorCode("WRONG_SIGNATURE"),
  );
  await assert.rejects(
    verifyEnvelope(envelope, other.publicPath, pack, schema),
    errorCode("WRONG_KEY"),
  );
  const widenedGrade = clone(request);
  widenedGrade.validationGrade.leanJson = "passed";
  await assert.rejects(
    signActivationRequest(widenedGrade, keys.privatePath, pack, schema),
    errorCode("REQUEST_GRADE"),
  );
  const changed = clone(pack);
  changed.commonsRotations[0].choices[0].capacity += 1;
  await assert.rejects(
    verifyEnvelope(envelope, keys.publicPath, changed, schema),
    errorCode("WRONG_ROOT"),
  );
});

test("counter skip refuses and rollback advances counter while restoring exact historical root", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poa-pack-rollback-"));
  const keys = await explicitTestKeys(directory);
  const genesisRequest = await createActivationRequest(pack, schema, {
    epoch: 1,
    counter: 1,
    genesis: true,
  });
  const genesis = await signActivationRequest(genesisRequest, keys.privatePath, pack, schema);

  const changed = clone(pack);
  changed.commonsRotations[0].choices[0].capacity += 1;
  await assert.rejects(
    createActivationRequest(changed, schema, {
      epoch: 1,
      counter: 3,
      previousEnvelope: genesis,
      previousPublicKeyPath: keys.publicPath,
    }),
    errorCode("COUNTER_SKIP"),
  );
  const successorRequest = await createActivationRequest(changed, schema, {
    epoch: 1,
    counter: 2,
    previousEnvelope: genesis,
    previousPublicKeyPath: keys.publicPath,
  });
  const tamperedCounterRequest = clone(successorRequest);
  tamperedCounterRequest.activationCounter = 4;
  await assert.rejects(
    signActivationRequest(
      tamperedCounterRequest,
      keys.privatePath,
      changed,
      schema,
      { previousEnvelope: genesis, previousPublicKeyPath: keys.publicPath },
    ),
    errorCode("COUNTER_SKIP"),
  );
  const successor = await signActivationRequest(
    successorRequest,
    keys.privatePath,
    changed,
    schema,
    {
      previousEnvelope: genesis,
      previousPublicKeyPath: keys.publicPath,
    },
  );
  const upgradeManifest = await createMigrationManifest(
    genesis,
    keys.publicPath,
    pack,
    successor,
    keys.publicPath,
    changed,
    schema,
  );
  assert.equal(upgradeManifest.mode, "upgrade");
  assert(upgradeManifest.diff.changeCount > 0);
  assert.equal(upgradeManifest.rollbackTarget, null);
  const rollbackRequest = await createActivationRequest(pack, schema, {
    epoch: 1,
    counter: 3,
    previousEnvelope: successor,
    previousPublicKeyPath: keys.publicPath,
    rollbackTargetEnvelope: genesis,
    rollbackTargetPublicKeyPath: keys.publicPath,
  });
  assert.equal(rollbackRequest.mode, "rollback");
  assert.equal(rollbackRequest.contentRoot, genesis.request.contentRoot);
  assert.equal(rollbackRequest.activationCounter, 3);
  assert.equal(rollbackRequest.rollbackTarget.historicalActivationCounter, 1);
  const rollback = await signActivationRequest(
    rollbackRequest,
    keys.privatePath,
    pack,
    schema,
    {
      previousEnvelope: successor,
      previousPublicKeyPath: keys.publicPath,
      rollbackTargetEnvelope: genesis,
      rollbackTargetPublicKeyPath: keys.publicPath,
    },
  );
  const manifest = await createMigrationManifest(
    successor,
    keys.publicPath,
    changed,
    rollback,
    keys.publicPath,
    pack,
    schema,
  );
  assert.equal(manifest.mode, "rollback");
  assert.equal(manifest.to.activationCounter, 3);
  assert.equal(manifest.rollbackTarget.contentRoot, genesis.request.contentRoot);

  const wrongTargetPack = clone(pack);
  wrongTargetPack.commonsRotations[0].choices[1].capacity += 1;
  await assert.rejects(
    createActivationRequest(wrongTargetPack, schema, {
      epoch: 1,
      counter: 3,
      previousEnvelope: successor,
      previousPublicKeyPath: keys.publicPath,
      rollbackTargetEnvelope: genesis,
      rollbackTargetPublicKeyPath: keys.publicPath,
    }),
    errorCode("ROLLBACK_ROOT"),
  );
});

test("alpha output is proposal-only and cannot be synthesized for unknown candidate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poa-pack-alpha-"));
  const keys = await explicitTestKeys(directory);
  const request = await createActivationRequest(pack, schema, {
    epoch: 1,
    counter: 1,
    genesis: true,
  });
  const envelope = await signActivationRequest(request, keys.privatePath, pack, schema);
  const proposal = await createAlphaProposal(
    pack,
    schema,
    envelope,
    keys.publicPath,
    "artifact",
    pack.crewMission.artifacts[0].id,
    Buffer.from("operator-authored alpha value", "utf8"),
  );
  assert.equal(proposal.status, "proposal-only");
  assert.equal(proposal.automatic, false);
  assert.equal(proposal.authorityGranted, false);
  assert.equal(proposal.requires, "explicit-curator-successor-action");
  assert(!canonicalBytes(proposal).includes(Buffer.from("operator-authored alpha value")));

  await assert.rejects(
    createAlphaProposal(
      pack,
      schema,
      envelope,
      keys.publicPath,
      "artifact",
      "invented-candidate",
      Buffer.from("x"),
    ),
    errorCode("UNKNOWN_CANDIDATE"),
  );
});

test("schema validation rejects undeclared fields rather than normalizing them away", () => {
  const hostile = clone(pack);
  hostile.crewMission.routes[0].surpriseBranch = true;
  assert.throws(() => validatePack(hostile, schema), errorCode("SCHEMA_ADDITIONAL"));
});
