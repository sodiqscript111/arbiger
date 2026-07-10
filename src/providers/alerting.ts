import type { Fingerprint, DeadEvent } from "../types";

export interface AlertingProvider {
  evaluate(event: DeadEvent, fingerprint: Fingerprint): Promise<void>;
}

export class NoopAlertingProvider implements AlertingProvider {
  async evaluate(_event: DeadEvent, _fingerprint: Fingerprint): Promise<void> {
  }
}
