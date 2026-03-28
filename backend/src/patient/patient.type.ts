import { TriageState } from 'src/shared.types';

export interface FullPatientDataI {
  id: string;
  name: string;
  phone_number: string;
  triage_state: TriageState;
  admitted_at: string;
  notes: string[];
  history: HistoryRecordI[];
  queue: QueueRecordI[];
}

export interface QueueRecordI {
  timestamp: Date;
  triage_state: TriageState;
  specialty: string;
  reffered_by_id: string;
}

export interface HistoryRecordI {
  reffered_by_id: string;
  specialty: string;
  triage_state: TriageState;
  reffered_to_id: string;
  is_done: boolean;
  timestamp: Date;
}
