"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBlocker = void 0;
class EventBlocker {
    _blockActive = false;
    _blockTimeout = null;
    _blockDuration;
    _extendIfActive;
    _adapter;
    constructor(adapter, blockDuration, extendIfActive) {
        this._adapter = adapter;
        this._blockDuration = blockDuration;
        this._extendIfActive = extendIfActive;
    }
    checkBlock() {
        if (this._blockDuration <= 0) {
            return false;
        }
        if (this._blockActive) {
            if (this._extendIfActive) {
                this.setUnblockTimeout();
            }
            return true;
        }
        this._blockActive = true;
        this.setUnblockTimeout();
        return false;
    }
    setUnblockTimeout() {
        if (this._blockTimeout) {
            this._adapter.clearTimeout(this._blockTimeout);
        }
        this._blockTimeout =
            this._adapter.setTimeout(() => {
                this._blockActive = false;
                this._blockTimeout = null;
            }, this._blockDuration * 1000) ?? null;
    }
}
exports.EventBlocker = EventBlocker;
//# sourceMappingURL=event-blocker.js.map