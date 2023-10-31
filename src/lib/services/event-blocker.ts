export class EventBlocker {
  private _blockActive: boolean = false;
  private _blockTimeout: NodeJS.Timeout | null = null;
  private _blockDuration: number = 0;
  private _extendIfActive: boolean = false;

  public constructor(blockDuration: number, extendIfActive: boolean) {
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
      clearTimeout(this._blockTimeout);
    }
    this._blockTimeout = setTimeout(() => {
      this._blockActive = false;
      this._blockTimeout = null;
    }, this._blockDuration * 1000);
  }
}
