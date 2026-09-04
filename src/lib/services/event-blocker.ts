import { RingAdapter } from "../../main";

export class EventBlocker {
  private _blockActive: boolean = false;
  private _blockTimeout: ioBroker.Timeout = null;
  private _blockDuration: number = 0;
  private _extendIfActive: boolean = false;
  private readonly _adapter: RingAdapter;

  public constructor(adapter: RingAdapter, blockDuration: number, extendIfActive: boolean) {
    this._adapter = adapter;
    this._blockDuration = blockDuration;
    this._extendIfActive = extendIfActive;
  }

  public checkBlock(): boolean {
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

  private setUnblockTimeout(): void {
    if (this._blockTimeout) {
      this._adapter.clearTimeout(this._blockTimeout);
    }
    this._blockTimeout = this._adapter.setTimeout((): void => {
      this._blockActive = false;
      this._blockTimeout = null;
    }, this._blockDuration * 1000) ?? null;
  }
}
