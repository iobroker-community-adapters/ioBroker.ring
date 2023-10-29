import { CameraEvent } from "ring-client-api";

export class LastAction {
  public constructor(public event: CameraEvent, public historyUrl: string) {
  }
}
