#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import {
  canonicalBytes,
  buildNightWatchJourney,
  contentRoot,
  createActivationRequest,
  createAlphaProposal,
  createMigrationManifest,
  diffPacks,
  makePublicBundle,
  makeWireFixture,
  previewPack,
  readJson,
  signActivationRequest,
  validatePack,
  verifyEnvelope,
  writeCanonicalNew,
} from "./poa-pack-lib.mjs";

const USAGE = `poa-pack — private Path of Angels content operator

usage:
  poa-pack validate --pack PATH --schema PATH [--wire-out PATH]
  poa-pack normalize --pack PATH --schema PATH --out PATH
  poa-pack public-bundle --pack PATH --schema PATH --out PATH
  poa-pack wire-fixture --pack PATH --schema PATH --out PATH
  poa-pack preview --pack PATH --schema PATH
  poa-pack night-watch --pack PATH --schema PATH --day N --choice ID --serving available|alternative --route maintenanceSpine|signalGallery|sealedNave --extraction returnNow|descendFurther
  poa-pack diff --from PATH --to PATH --schema PATH
  poa-pack request --pack PATH --schema PATH --epoch N --counter N --out PATH --genesis true
  poa-pack request --pack PATH --schema PATH --epoch N --counter N --out PATH --previous-envelope PATH --previous-public-key PATH
  poa-pack request --pack PATH --schema PATH --epoch N --counter N --out PATH --previous-envelope PATH --previous-public-key PATH --rollback-target-envelope PATH --rollback-target-public-key PATH
  poa-pack sign --request PATH --pack PATH --schema PATH --key PATH --out PATH [--previous-envelope PATH --previous-public-key PATH] [--rollback-target-envelope PATH --rollback-target-public-key PATH]
  poa-pack verify --envelope PATH --public-key PATH --pack PATH --schema PATH
  poa-pack manifest --from-envelope PATH --from-public-key PATH --from-pack PATH --to-envelope PATH --to-public-key PATH --to-pack PATH --schema PATH --out PATH
  poa-pack propose-alpha --pack PATH --schema PATH --envelope PATH --public-key PATH --candidate-kind place|artifact|relic --candidate-id ID --alpha-value-file PATH --out PATH

All output paths are create-new. Signing requires an existing caller-supplied
Ed25519 PEM key; this command never creates, stores, or prints secret material.
The authoring validator is not Lean validation. Its report names the unavailable
JSON seam and emits an opaque-ID fixture for the future Lean decoder/export.
`;

function parseFlags(argv) {
  if (argv.length % 2 !== 0) throw new Error("every --flag requires one value");
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag.startsWith("--") || flag.length === 2) throw new Error(`expected --flag, got ${flag}`);
    const name = flag.slice(2);
    if (flags.has(name)) throw new Error(`duplicate --${name}`);
    flags.set(name, argv[index + 1]);
  }
  return flags;
}

function exactFlags(flags, required, optional = []) {
  for (const name of required) if (!flags.has(name)) throw new Error(`missing --${name}`);
  for (const name of flags.keys()) {
    if (!required.includes(name) && !optional.includes(name)) throw new Error(`unknown flag --${name}`);
  }
}

function value(flags, name) {
  const result = flags.get(name);
  if (result === undefined) throw new Error(`missing --${name}`);
  return result;
}

function integer(flags, name) {
  const parsed = Number(value(flags, name));
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name} must be a safe integer`);
  return parsed;
}

async function loadPackAndSchema(flags) {
  const [pack, schema] = await Promise.all([readJson(value(flags, "pack")), readJson(value(flags, "schema"))]);
  return { pack, schema };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function commandValidate(flags) {
  exactFlags(flags, ["pack", "schema"], ["wire-out"]);
  const { pack, schema } = await loadPackAndSchema(flags);
  const report = validatePack(pack, schema);
  if (flags.has("wire-out")) {
    const wire = makeWireFixture(pack, schema);
    await writeCanonicalNew(value(flags, "wire-out"), wire);
    report.wireFixture = {
      path: value(flags, "wire-out"),
      root: contentRoot(wire),
      grade: wire.grade,
    };
  }
  printJson(report);
}

async function commandNormalize(flags) {
  exactFlags(flags, ["pack", "schema", "out"]);
  const { pack, schema } = await loadPackAndSchema(flags);
  validatePack(pack, schema);
  await writeCanonicalNew(value(flags, "out"), pack);
  printJson({ written: value(flags, "out"), contentRoot: contentRoot(pack), bytes: canonicalBytes(pack).length });
}

async function commandPublicBundle(flags) {
  exactFlags(flags, ["pack", "schema", "out"]);
  const { pack, schema } = await loadPackAndSchema(flags);
  const bundle = makePublicBundle(pack, schema);
  await writeCanonicalNew(value(flags, "out"), bundle);
  printJson({ written: value(flags, "out"), publicBundleRoot: contentRoot(bundle), sourceContentRoot: bundle.sourceContentRoot });
}

async function commandWireFixture(flags) {
  exactFlags(flags, ["pack", "schema", "out"]);
  const { pack, schema } = await loadPackAndSchema(flags);
  const wire = makeWireFixture(pack, schema);
  await writeCanonicalNew(value(flags, "out"), wire);
  printJson({ written: value(flags, "out"), wireFixtureRoot: contentRoot(wire), grade: wire.grade });
}

async function commandPreview(flags) {
  exactFlags(flags, ["pack", "schema"]);
  const { pack, schema } = await loadPackAndSchema(flags);
  process.stdout.write(previewPack(pack, schema));
}

async function commandNightWatch(flags) {
  exactFlags(flags, ["pack", "schema", "day", "choice", "serving", "route", "extraction"]);
  const { pack, schema } = await loadPackAndSchema(flags);
  const serving = value(flags, "serving");
  if (!["available", "alternative"].includes(serving)) {
    throw new Error("--serving must be available or alternative");
  }
  printJson(buildNightWatchJourney(pack, schema, {
    finalizedDay: integer(flags, "day"),
    choiceId: value(flags, "choice"),
    servingAvailable: serving === "available",
    routeId: value(flags, "route"),
    extraction: value(flags, "extraction"),
  }));
}

async function commandDiff(flags) {
  exactFlags(flags, ["from", "to", "schema"]);
  const [from, to, schema] = await Promise.all([
    readJson(value(flags, "from")),
    readJson(value(flags, "to")),
    readJson(value(flags, "schema")),
  ]);
  validatePack(from, schema);
  validatePack(to, schema);
  printJson(diffPacks(from, to));
}

async function commandRequest(flags) {
  exactFlags(
    flags,
    ["pack", "schema", "epoch", "counter", "out"],
    ["genesis", "previous-envelope", "previous-public-key", "rollback-target-envelope", "rollback-target-public-key"],
  );
  const { pack, schema } = await loadPackAndSchema(flags);
  const previousEnvelope = flags.has("previous-envelope") ? await readJson(value(flags, "previous-envelope")) : null;
  const rollbackTargetEnvelope = flags.has("rollback-target-envelope") ? await readJson(value(flags, "rollback-target-envelope")) : null;
  const request = await createActivationRequest(pack, schema, {
    epoch: integer(flags, "epoch"),
    counter: integer(flags, "counter"),
    genesis: flags.get("genesis") === "true",
    previousEnvelope,
    previousPublicKeyPath: flags.get("previous-public-key"),
    rollbackTargetEnvelope,
    rollbackTargetPublicKeyPath: flags.get("rollback-target-public-key"),
  });
  await writeCanonicalNew(value(flags, "out"), request);
  printJson({ written: value(flags, "out"), requestRoot: contentRoot(request), mode: request.mode });
}

async function commandSign(flags) {
  exactFlags(
    flags,
    ["request", "pack", "schema", "key", "out"],
    ["previous-envelope", "previous-public-key", "rollback-target-envelope", "rollback-target-public-key"],
  );
  const [request, pack, schema] = await Promise.all([
    readJson(value(flags, "request")),
    readJson(value(flags, "pack")),
    readJson(value(flags, "schema")),
  ]);
  const envelope = await signActivationRequest(
    request,
    value(flags, "key"),
    pack,
    schema,
    {
      previousEnvelope: flags.has("previous-envelope")
        ? await readJson(value(flags, "previous-envelope"))
        : null,
      previousPublicKeyPath: flags.get("previous-public-key"),
      rollbackTargetEnvelope: flags.has("rollback-target-envelope")
        ? await readJson(value(flags, "rollback-target-envelope"))
        : null,
      rollbackTargetPublicKeyPath: flags.get("rollback-target-public-key"),
    },
  );
  await writeCanonicalNew(value(flags, "out"), envelope);
  printJson({ written: value(flags, "out"), envelopeRoot: contentRoot(envelope), keyId: envelope.keyId });
}

async function commandVerify(flags) {
  exactFlags(flags, ["envelope", "public-key", "pack", "schema"]);
  const [envelope, pack, schema] = await Promise.all([
    readJson(value(flags, "envelope")),
    readJson(value(flags, "pack")),
    readJson(value(flags, "schema")),
  ]);
  printJson(await verifyEnvelope(envelope, value(flags, "public-key"), pack, schema));
}

async function commandManifest(flags) {
  exactFlags(flags, ["from-envelope", "from-public-key", "from-pack", "to-envelope", "to-public-key", "to-pack", "schema", "out"]);
  const [fromEnvelope, fromPack, toEnvelope, toPack, schema] = await Promise.all([
    readJson(value(flags, "from-envelope")),
    readJson(value(flags, "from-pack")),
    readJson(value(flags, "to-envelope")),
    readJson(value(flags, "to-pack")),
    readJson(value(flags, "schema")),
  ]);
  const manifest = await createMigrationManifest(
    fromEnvelope,
    value(flags, "from-public-key"),
    fromPack,
    toEnvelope,
    value(flags, "to-public-key"),
    toPack,
    schema,
  );
  await writeCanonicalNew(value(flags, "out"), manifest);
  printJson({ written: value(flags, "out"), manifestRoot: contentRoot(manifest), mode: manifest.mode });
}

async function commandProposeAlpha(flags) {
  exactFlags(flags, ["pack", "schema", "envelope", "public-key", "candidate-kind", "candidate-id", "alpha-value-file", "out"]);
  const [pack, schema, envelope, alphaValue] = await Promise.all([
    readJson(value(flags, "pack")),
    readJson(value(flags, "schema")),
    readJson(value(flags, "envelope")),
    readFile(value(flags, "alpha-value-file")),
  ]);
  const proposal = await createAlphaProposal(
    pack,
    schema,
    envelope,
    value(flags, "public-key"),
    value(flags, "candidate-kind"),
    value(flags, "candidate-id"),
    alphaValue,
  );
  await writeCanonicalNew(value(flags, "out"), proposal);
  printJson({ written: value(flags, "out"), proposalRoot: contentRoot(proposal), status: proposal.status });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(USAGE);
    return;
  }
  const flags = parseFlags(rest);
  const commands = {
    validate: commandValidate,
    normalize: commandNormalize,
    "public-bundle": commandPublicBundle,
    "wire-fixture": commandWireFixture,
    preview: commandPreview,
    "night-watch": commandNightWatch,
    diff: commandDiff,
    request: commandRequest,
    sign: commandSign,
    verify: commandVerify,
    manifest: commandManifest,
    "propose-alpha": commandProposeAlpha,
  };
  const handler = commands[command];
  if (!handler) throw new Error(`unknown command ${command}\n\n${USAGE}`);
  await handler(flags);
}

main().catch((error) => {
  process.stderr.write(`poa-pack: ${error.message}\n`);
  process.exitCode = 2;
});
