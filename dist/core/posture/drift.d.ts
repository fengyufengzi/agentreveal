import type { DriftComparison, DriftSnapshot } from "./types.js";
export interface CompareDriftOptions {
    previousObservation?: DriftSnapshot;
    seenEventIds?: readonly string[];
}
export interface DriftComparisonDetails {
    comparison: DriftComparison;
    activeEventIds: string[];
    seenEventIds: string[];
}
export declare function compareDriftSnapshots(baseline: DriftSnapshot | undefined, current: DriftSnapshot, options?: CompareDriftOptions): DriftComparisonDetails;
