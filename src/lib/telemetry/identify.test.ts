import { describe, expect, it } from "vitest";
import { hashUserIdForTelemetry, sha256Hex } from "./identify";

describe("hashUserIdForTelemetry", () => {
  it("returns SHA-256 hex of id+salt and never the raw id", async () => {
    const rawId = "user-uuid-abc-123";
    const salt = "static-test-salt";
    const hashed = await hashUserIdForTelemetry(rawId, salt);
    expect(hashed).toBeTruthy();
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(rawId);
    expect(hashed).toBe(await sha256Hex(`${rawId}${salt}`));
  });

  it("returns null without id or salt", async () => {
    expect(await hashUserIdForTelemetry("", "salt")).toBeNull();
    expect(await hashUserIdForTelemetry("id", "")).toBeNull();
    expect(await hashUserIdForTelemetry(null, "salt")).toBeNull();
  });

  it("is deterministic for the same inputs", async () => {
    const a = await hashUserIdForTelemetry("u1", "s1");
    const b = await hashUserIdForTelemetry("u1", "s1");
    const c = await hashUserIdForTelemetry("u1", "s2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
