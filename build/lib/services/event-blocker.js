"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBlocker = void 0;
class EventBlocker {
    constructor(blockDuration, extendIfActive) {
        this._blockActive = false;
        this._blockTimeout = null;
        this._blockDuration = 0;
        this._extendIfActive = false;
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
            clearTimeout(this._blockTimeout);
        }
        this._blockTimeout = setTimeout(() => {
            this._blockActive = false;
            this._blockTimeout = null;
        }, this._blockDuration * 1000);
    }
}
exports.EventBlocker = EventBlocker;
//# sourceMappingURL=event-blocker.js.map