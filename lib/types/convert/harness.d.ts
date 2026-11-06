import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { HarnessRequest } from '../adapter.ts';
/** Translate one harness request into what the adapter reads. */
export declare function requestOf(options: GenerateOptions<string>): HarnessRequest;
/** Minimal attachment-store read contract; resolved by the host per request. */
export type ReadImage = (ref: unknown, signal?: AbortSignal) => Promise<{
    data: Uint8Array;
    ref: {
        mediaType: string;
    };
}>;
/** Resolve durable DSH image references to SIWC input_image data URLs, preserving block order. */
export declare function requestOfWithImages(options: GenerateOptions<string>, readImage?: ReadImage): Promise<HarnessRequest>;
//# sourceMappingURL=harness.d.ts.map