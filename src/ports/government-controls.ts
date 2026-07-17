export interface GovernmentControls {
  isCandidateAppointmentAvailable(): boolean;
  appointCandidate(index: number): boolean;
}
