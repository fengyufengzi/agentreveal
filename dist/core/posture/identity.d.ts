import type { HmacIdentity } from "./types.js";
export interface PostureIdentityKeyOptions {
    path?: string;
    allowCreate?: boolean;
    random?: (size: number) => Buffer;
}
export declare function defaultPostureIdentityKeyPath(home?: string): string;
export declare function loadOrCreatePostureIdentityKey(options?: PostureIdentityKeyOptions): Buffer;
export declare function postureHmacIdentity(key: Buffer, context: string, value: string): HmacIdentity;
