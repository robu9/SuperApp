import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initialRuntimeStatus } from "./runtime-types.ts";
import {
  isSupportedRuntimePlatform,
  nextRuntimeStatus,
  readManagedApiKey,
} from "./runtime-policy.ts";

test("runtime platform policy supports only macOS and Linux", () => {
  assert.equal(isSupportedRuntimePlatform("darwin"), true);
  assert.equal(isSupportedRuntimePlatform("linux"), true);
  assert.equal(isSupportedRuntimePlatform("win32"), false);
});

test("runtime progress is clamped and readiness is preserved", () => {
  const status = nextRuntimeStatus(
    initialRuntimeStatus(),
    "starting-backend",
    "starting backend",
    120,
    { memoryReady: true }
  );
  assert.equal(status.progress, 100);
  assert.equal(status.memoryReady, true);
  assert.equal(status.backendReady, false);
});

test("managed API key supports current and legacy filenames", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "superapp-runtime-"));
  try {
    assert.equal(readManagedApiKey(directory), "local");
    writeFileSync(path.join(directory, "api_key"), "legacy-key\n");
    assert.equal(readManagedApiKey(directory), "legacy-key");
    writeFileSync(path.join(directory, "api-key"), "current-key\n");
    assert.equal(readManagedApiKey(directory), "current-key");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
