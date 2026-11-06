/** Exclusively serialize the read → refresh → write transaction across DSH processes. */
export declare function withCredentialFileLock<T>(credentialPath: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
//# sourceMappingURL=file-lock.d.ts.map