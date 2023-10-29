export class EventBlocker {
  private _blockActive: boolean = false;
  private _blockTimeout: NodeJS.Timeout | null = null;

  public checkBlock(blockDuration: number, extendIfActive: boolean): boolean {
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

  private setUnblockTimeout(blockDuration: number): void {
    if (this._blockTimeout) {
      clearTimeout(this._blockTimeout);
    }
    this._blockTimeout = setTimeout(() => {
      this._blockActive = false;
      this._blockTimeout = null;
    }, blockDuration * 1000);
  }
}
