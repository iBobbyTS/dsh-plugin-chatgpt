/** Responses item indexes remain distinct across interleaved text, reasoning and tools. */
import type { ResponsesEvent, ResponsesUsage } from '../api/events.ts';
import { type ReplayBlock, type ReplayContext, type ReplayEnvelope } from './replay.ts';
export type ToolCallBlock = Extract<ReplayBlock, {
    type: 'tool-call';
}>;
export type TextBlock = {
    type: 'text';
    text: string;
};
export type ReasoningBlock = {
    type: 'reasoning';
    text: string;
};
export type AdapterChunk = {
    type: 'block-start';
    index: number;
    blockType: 'text' | 'reasoning' | 'tool-call';
} | {
    type: 'text-delta';
    index: number;
    text: string;
} | {
    type: 'reasoning-delta';
    index: number;
    text: string;
} | {
    type: 'tool-call-delta';
    index: number;
    id: string;
    name?: string;
    argumentsDelta: string;
} | {
    type: 'block-end';
    index: number;
    block: ReplayBlock;
} | {
    type: 'usage';
    usage: ResponsesUsage;
} | {
    type: 'finish';
    reason: {
        kind: 'stop';
    } | {
        kind: 'tool-calls';
    } | {
        kind: 'max-tokens';
    } | {
        kind: 'error';
        failure: {
            message: string;
            code?: string;
        };
    };
    replayState?: ReplayEnvelope;
};
export declare class BlockTranslator {
    private readonly states;
    private readonly emitted;
    private readonly display;
    private readonly byIndex;
    private readonly byId;
    private readonly byCall;
    private anonymous;
    private hasAnonymous;
    private replayable;
    private terminal;
    private readonly context;
    constructor(context?: ReplayContext);
    private find;
    private bind;
    private open;
    private close;
    /** A gap is buffered so a late earlier item can still precede it in DSH's first-seen order. */
    private flush;
    private fits;
    private finishItem;
    private item;
    private append;
    /** Positions may introduce missing items only after the snapshot agrees with every known identity. */
    private completeSnapshot;
    private snapshot;
    push(event: ResponsesEvent): AdapterChunk[];
    /** Preserve all received display content when a stream terminates or is interrupted. */
    endAll(): AdapterChunk[];
}
//# sourceMappingURL=blocks.d.ts.map