export const DATA_PURGE_VERSION = "data-purge/v1";
export const DATA_PURGE_CONFIRMATION = "PURGE_EXPIRED_DATA";
export const DATA_PURGE_RETENTION_DAYS = 7;

export type DataPurgeMode = "dry-run" | "execute";

export interface DataPurgeArguments {
  mode: DataPurgeMode;
  calculationTime: Date;
}

export class DataPurgeUsageError extends Error {}

export function parseDataPurgeArguments(args: string[], defaultTime = new Date()): DataPurgeArguments {
  let mode: DataPurgeMode = "dry-run";
  let calculationTime = defaultTime;
  let confirmation: string | undefined;

  for (const argument of args) {
    if (argument === "--dry-run") mode = "dry-run";
    else if (argument === "--execute") mode = "execute";
    else if (argument.startsWith("--calculation-time=")) {
      const value = argument.slice("--calculation-time=".length);
      const parsed = new Date(value);
      if (!value || Number.isNaN(parsed.getTime())) throw new DataPurgeUsageError("Invalid --calculation-time");
      calculationTime = parsed;
    } else if (argument.startsWith("--confirm=")) confirmation = argument.slice("--confirm=".length);
    else throw new DataPurgeUsageError("Unknown argument");
  }

  if (mode === "execute" && confirmation !== DATA_PURGE_CONFIRMATION) {
    throw new DataPurgeUsageError(`Execute requires --confirm=${DATA_PURGE_CONFIRMATION}`);
  }
  if (mode === "dry-run" && confirmation !== undefined) {
    throw new DataPurgeUsageError("--confirm is only valid with --execute");
  }
  return { mode, calculationTime };
}
