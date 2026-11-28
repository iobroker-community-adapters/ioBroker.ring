/**
 * Remembers ids for a while and reports an id that shows up again within that time.
 *
 * Ring delivers the same push notification several times, sometimes over 20 minutes and more, and
 * ring-client-api passes every copy on (#548, #711, #632). All copies carry the same ding id, so a
 * notification can only be told apart from a repeated one by that id - a time based block cannot.
 */
export class DuplicateFilter {
    private readonly _seen: Map<string, number> = new Map();
    private readonly _memoryMs: number;

    public constructor(memoryMs: number) {
        this._memoryMs = memoryMs;
    }

    /** @returns true, if the id was already seen within the memory time. An empty id is never a duplicate. */
    public isDuplicate(id: string | number | null | undefined): boolean {
        if (id === undefined || id === null || id === '') {
            return false;
        }
        const key = String(id);
        const now: number = Date.now();
        // A Map iterates in insertion order and an id is only inserted once, so the oldest come first
        for (const [seenId, seenAt] of this._seen) {
            if (now - seenAt < this._memoryMs) {
                break;
            }
            this._seen.delete(seenId);
        }
        if (this._seen.has(key)) {
            return true;
        }
        this._seen.set(key, now);
        return false;
    }
}
