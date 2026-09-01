export interface DesktopScopedRecord {
  desktopId: string;
}

export interface DesktopRecordRemoval<T> {
  kept: T[];
  removedCount: number;
}

export function removeDesktopRecords<T extends DesktopScopedRecord>(
  records: readonly T[],
  desktopId: string,
): DesktopRecordRemoval<T> {
  const kept = records.filter((record) => record.desktopId !== desktopId);
  return {
    kept,
    removedCount: records.length - kept.length,
  };
}
