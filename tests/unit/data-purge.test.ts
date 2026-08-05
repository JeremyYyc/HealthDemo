import { describe, expect, it } from "vitest";
import { DATA_PURGE_CONFIRMATION, DataPurgeUsageError, parseDataPurgeArguments } from "../../src/domain/data-purge.js";

describe("P0-11 purge command arguments", () => {
  const fixedTime = new Date("2026-08-05T00:00:00.000Z");

  it("defaults to dry-run and accepts a reproducible calculation time", () => {
    expect(parseDataPurgeArguments([], fixedTime)).toEqual({ mode: "dry-run", calculationTime: fixedTime });
    expect(parseDataPurgeArguments(["--calculation-time=2026-07-01T12:30:00.000Z"], fixedTime)).toEqual({
      mode: "dry-run", calculationTime: new Date("2026-07-01T12:30:00.000Z"),
    });
  });

  it("requires the exact confirmation for execute and rejects unsafe arguments", () => {
    expect(() => parseDataPurgeArguments(["--execute"], fixedTime)).toThrow(DataPurgeUsageError);
    expect(() => parseDataPurgeArguments(["--execute", "--confirm=wrong"], fixedTime)).toThrow(DataPurgeUsageError);
    expect(() => parseDataPurgeArguments([`--confirm=${DATA_PURGE_CONFIRMATION}`], fixedTime)).toThrow(DataPurgeUsageError);
    expect(() => parseDataPurgeArguments(["--calculation-time=invalid"], fixedTime)).toThrow(DataPurgeUsageError);
    expect(parseDataPurgeArguments(["--execute", `--confirm=${DATA_PURGE_CONFIRMATION}`], fixedTime)).toEqual({ mode: "execute", calculationTime: fixedTime });
  });
});
