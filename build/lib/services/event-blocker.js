"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBlocker = void 0;
class EventBlocker {
    constructor() {
        this._blockActive = false;
        this._blockTimeout = null;
    }
    checkBlock(blockDuration, extendIfActive) {
        if (blockDuration <= 0) {
            return false;
        }
        if (this._blockActive) {
            if (extendIfActive) {
                this.setUnblockTimeout(blockDuration);
            }
            return true;
        }
        this._blockActive = true;
        this.setUnblockTimeout(blockDuration);
        return false;
    }
    setUnblockTimeout(blockDuration) {
        if (this._blockTimeout) {
            clearTimeout(this._blockTimeout);
        }
        this._blockTimeout = setTimeout(() => {
            this._blockActive = false;
            this._blockTimeout = null;
        }, blockDuration * 1000);
    }
}
exports.EventBlocker = EventBlocker;
//# sourceMappingURL=event-blocker.js.map