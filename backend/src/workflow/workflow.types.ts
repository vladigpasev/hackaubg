import { z } from 'zod';
import type { CheckInResponseI } from '../patient/patient.dto';
import type { HistoryRecordI, QueueRecordI } from '../patient/patient.type';
import type { TriageState } from '../shared.types';

export const TRIAGE_PRIORITIES: Record<TriageState, number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
};

export const doctorStatusPayloadSchema = z
  .object({
    online: z.boolean(),
  })
  .strict();

export const sendPatientPayloadSchema = z
  .object({
    patient: z.string().trim().min(1, 'patient is required'),
    specialty: z.string().trim().min(1, 'specialty is required'),
    triage: z.enum(['YELLOW', 'GREEN']).optional(),
  })
  .strict();

export const finishTestPayloadSchema = z
  .object({
    patient: z.string().trim().min(1, 'patient is required'),
    specialty: z.string().trim().min(1, 'specialty is required'),
  })
  .strict();

export type DoctorStatusPayloadI = z.infer<typeof doctorStatusPayloadSchema>;
export type SendPatientPayloadI = z.infer<typeof sendPatientPayloadSchema>;
export type FinishTestPayloadI = z.infer<typeof finishTestPayloadSchema>;

export interface StoredHistoryRecordI extends Omit<
  HistoryRecordI,
  'timestamp'
> {
  timestamp: string;
}

export interface StoredPatientRecordI extends Omit<
  CheckInResponseI,
  'admitted_at'
> {
  admitted_at: string;
  history: StoredHistoryRecordI[];
}

export interface QueueSnapshotEventI {
  id: string;
  queue: QueueRecordI[];
}
