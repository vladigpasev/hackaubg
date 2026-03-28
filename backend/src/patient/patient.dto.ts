import { TRIAGE_STATES, TriageState } from 'src/shared.types';
import { z } from 'zod';
import { HistoryRecordI, QueueRecordI } from './patient.type';

export const checkInPayloadSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  phone_number: z.string().trim().min(1, 'phone_number is required'),
  triage_state: z.enum(TRIAGE_STATES),
});

export const attachPatientNotePayloadSchema = z.object({
  note: z.string().trim().min(1, 'note is required'),
});

export type CheckInPayloadI = z.infer<typeof checkInPayloadSchema>;
export type AttachPatientNotePayloadI = z.infer<
  typeof attachPatientNotePayloadSchema
>;

export interface CheckInResponseI {
  id: string;
  name: string;
  phone_number: string;
  triage_state: TriageState;
  admitted_at: Date;
  notes: string[];
}

export interface PatientDetailsResponseI extends CheckInResponseI {
  queue: QueueRecordI[];
  history: HistoryRecordI[];
}

export interface PatientI extends CheckInResponseI {}

export type AllPatientsI = PatientI[];
