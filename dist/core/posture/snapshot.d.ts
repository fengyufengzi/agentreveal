import { type BaselineMutationResult, type BaselinePreview, type DriftComparison, type DriftPolicyState, type DriftSnapshot, type EffectiveAgentState } from "./types.js";
export interface PostureSnapshotStoreOptions {
    path?: string;
    keyPath?: string;
    cwd?: string;
    scopeId?: string;
    now?: () => Date;
    random?: (size: number) => Buffer;
    policyStates?: (now: Date) => readonly DriftPolicyState[];
}
export declare function defaultPostureSnapshotPath(home?: string): string;
export declare function buildDriftSnapshot(states: readonly EffectiveAgentState[], key: Buffer, capturedAt?: Date, policyStates?: readonly DriftPolicyState[]): DriftSnapshot;
export declare class PostureSnapshotStore {
    readonly path: string;
    readonly keyPath: string;
    readonly scopeId: string;
    private readonly now;
    private readonly random?;
    private readonly policyStates;
    constructor(options?: PostureSnapshotStoreOptions);
    private read;
    private write;
    private storageRevision;
    private snapshotFingerprint;
    private buildSnapshot;
    private withMutationLock;
    previewBaseline(states: readonly EffectiveAgentState[]): BaselinePreview;
    getBaseline(): DriftSnapshot | undefined;
    saveBaseline(states: readonly EffectiveAgentState[], options?: {
        expectedCurrentFingerprint?: string;
        expectedStorageRevision?: string;
    }): DriftSnapshot;
    saveBaselineConfirmed(states: readonly EffectiveAgentState[], preview: Pick<BaselinePreview, "currentFingerprint" | "storageRevision">): BaselineMutationResult;
    compare(states: readonly EffectiveAgentState[], options?: {
        recordObservation?: boolean;
    }): DriftComparison;
    removeBaseline(options?: {
        expectedStorageRevision?: string;
    }): boolean;
    removeBaselineConfirmed(storageRevision: string): BaselineMutationResult;
}
