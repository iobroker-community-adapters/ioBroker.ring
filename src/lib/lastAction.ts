import { CameraEvent } from "ring-client-api";

export class LastAction {
  constructor(public event: CameraEvent, public historyUrl: string) {
  }
}
