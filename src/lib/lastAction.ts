import type { CameraEvent } from "ring-client-api" with { "resolution-mode": "import" };

export class LastAction {
  public constructor(public event: CameraEvent, public historyUrl: string) {
  }
}
