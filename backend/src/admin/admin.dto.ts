import { z } from 'zod';

const STAFF_ROLES = ['registry', 'nurse', 'doctor'] as const;

const specialtySchema = z.string().trim().min(1, 'specialty is required');

export const createStaffPayloadSchema = z
  .object({
    username: z.string().trim().min(1, 'username is required'),
    password: z.string().min(8, 'password must be at least 8 characters'),
    role: z.enum(STAFF_ROLES),
    isTester: z.boolean().optional(),
    specialties: z.array(specialtySchema).optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.role === 'doctor' && (!payload.specialties || payload.specialties.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'doctor must have at least one specialty',
        path: ['specialties'],
      });
    }
  });

export const updateStaffPayloadSchema = z
  .object({
    username: z.string().trim().min(1, 'username is required').optional(),
    password: z
      .string()
      .min(8, 'password must be at least 8 characters')
      .optional(),
    role: z.enum(STAFF_ROLES).optional(),
    isTester: z.boolean().optional(),
    specialties: z.array(specialtySchema).optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'at least one field is required',
  })
  .superRefine((payload, context) => {
    if (payload.role === 'doctor' && payload.specialties !== undefined && payload.specialties.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'doctor must have at least one specialty',
        path: ['specialties'],
      });
    }
  });

export type StaffRole = (typeof STAFF_ROLES)[number];

export type CreateStaffPayload = z.infer<typeof createStaffPayloadSchema>;
export type UpdateStaffPayload = z.infer<typeof updateStaffPayloadSchema>;
