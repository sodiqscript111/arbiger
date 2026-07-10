export interface DiagnosisProvider {
  analyzeIncident(tenantId: string, incidentId: string): Promise<void>;
}

export class NoopDiagnosisProvider implements DiagnosisProvider {
  async analyzeIncident(_tenantId: string, _incidentId: string): Promise<void> {
  }
}
