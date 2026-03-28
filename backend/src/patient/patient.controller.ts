import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../shared.decoraters';
import { TRIAGE_STATES } from '../shared.types';
import {
  AllPatientsI,
  AttachPatientNotePayloadI,
  attachPatientNotePayloadSchema,
  CheckInPayloadI,
  checkInPayloadSchema,
  IArchivedDateResultsResponse,
  UpdatePatientI,
  updatePatientPayloadSchema,
} from './patient.dto';
import { PatientService } from './patient.service';

const TRIAGE_STATE_ENUM = [...TRIAGE_STATES];

const patientSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'John Doe' },
    phone_number: { type: 'string', example: '+359888123456' },
    triage_state: {
      type: 'string',
      enum: TRIAGE_STATE_ENUM,
      example: 'YELLOW',
    },
    admitted_at: {
      type: 'string',
      format: 'date-time',
      example: '2026-03-28T12:10:30.000Z',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      example: ['Patient reports chest discomfort for 20 minutes.'],
    },
  },
};

const queueRecordSchema = {
  type: 'object',
  properties: {
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-03-28T12:15:00.000Z',
    },
    triage_state: {
      type: 'string',
      enum: TRIAGE_STATE_ENUM,
      example: 'RED',
    },
    specialty: { type: 'string', example: 'Cardiology' },
    reffered_by_id: {
      type: 'string',
      format: 'uuid',
      example: '0f88a9f8-90ce-4f1b-8530-e38980f2f653',
    },
  },
};

const historyRecordSchema = {
  type: 'object',
  properties: {
    reffered_by_id: {
      type: 'string',
      format: 'uuid',
      example: '0f88a9f8-90ce-4f1b-8530-e38980f2f653',
    },
    specialty: { type: 'string', example: 'Cardiology' },
    triage_state: {
      type: 'string',
      enum: TRIAGE_STATE_ENUM,
      example: 'YELLOW',
    },
    reffered_to_id: {
      type: 'string',
      format: 'uuid',
      example: '98e039c4-17e8-4f5f-a8fb-58f7ddb9e7a6',
    },
    is_done: { type: 'boolean', example: true },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-03-28T12:25:00.000Z',
    },
  },
};

@ApiTags('patients')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Roles('registry')
  @Post('check-in')
  @ApiOperation({
    summary: 'Check in a patient',
    description:
      'Creates a new active patient record and places the patient in the live queue scope.',
  })
  @ApiBody({
    description: 'Patient information required for check-in.',
    schema: {
      type: 'object',
      required: ['name', 'phone_number', 'triage_state'],
      properties: {
        name: { type: 'string', minLength: 1, example: 'John Doe' },
        phone_number: {
          type: 'string',
          minLength: 1,
          example: '+359888123456',
        },
        triage_state: {
          type: 'string',
          enum: TRIAGE_STATE_ENUM,
          example: 'YELLOW',
        },
      },
      example: {
        name: 'John Doe',
        phone_number: '+359888123456',
        triage_state: 'YELLOW',
      },
    },
  })
  @ApiOkResponse({
    description: 'Patient successfully checked in.',
    schema: patientSchema,
  })
  @ApiBadRequestResponse({
    description: 'Request body failed validation.',
  })
  @ApiConflictResponse({
    description: 'Patient with this phone number is already checked in.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient role. Only registry can check in patients.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Unable to persist patient check-in at this time.',
  })
  checkIn(
    @Body(new ZodValidationPipe(checkInPayloadSchema)) body: CheckInPayloadI,
  ) {
    return this.patientService.checkIn(body);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Get('/all')
  @ApiOperation({
    summary: 'List all checked-in patients',
    description:
      'Returns all currently active patient records from the live queue.',
  })
  @ApiOkResponse({
    description: 'Active patients retrieved successfully.',
    schema: {
      type: 'array',
      items: patientSchema,
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role for this endpoint.' })
  @ApiServiceUnavailableResponse({
    description: 'Unable to retrieve patient list.',
  })
  async getAllPatients(): Promise<AllPatientsI> {
    return this.patientService.getAllPatients();
  }

  @Roles('registry')
  @Get('archive-now')
  @ApiOperation({
    summary: 'Run archival now',
    description:
      'Triggers patient archival immediately using the same archival logic as the scheduled job.',
  })
  @ApiOkResponse({
    description: 'Archival executed successfully.',
    schema: {
      type: 'object',
      properties: {
        archived: { type: 'boolean', example: true },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient role. Only registry can run archival.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Unable to complete archival at this time.',
  })
  async archiveNow(): Promise<{ archived: true }> {
    await this.patientService.executeArchival();
    return { archived: true };
  }

  @Roles('registry', 'nurse', 'doctor') //TODO: Should be changed to the role of admin
  @Get('archive/:dateTime')
  @ApiOperation({
    summary: 'Read archived records by date-time',
    description:
      'Loads archived patient JSON files and archived users CSV for the provided date-time and returns the transformed in-memory result.',
  })
  @ApiParam({
    name: 'dateTime',
    description:
      'ISO 8601 date-time used to resolve the archive day in Sofia timezone.',
    example: '2026-03-29T12:30:00.000Z',
  })
  @ApiOkResponse({
    description: 'Archived records retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string', example: '2026-03-29' },
        count: { type: 'number', example: 5 },
        users: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              username: { type: 'string', example: 'doctor.petrova' },
              role: { type: 'string', enum: ['registry', 'nurse', 'doctor'] },
              isTester: { type: 'boolean', example: false },
              specialties: {
                type: 'array',
                items: { type: 'string' },
                example: ['cardiology'],
              },
            },
          },
        },
        patients: {
          type: 'array',
          items: patientSchema,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid date-time path parameter.',
  })
  @ApiNotFoundResponse({
    description: 'Archive for the resolved date was not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role for this endpoint.' })
  @ApiServiceUnavailableResponse({
    description: 'Unable to read archive contents at this time.',
  })
  async getArchiveByDateTime(
    @Param('dateTime') dateTime: string,
  ): Promise<IArchivedDateResultsResponse> {
    return this.patientService.getArchivedByDateTime(dateTime);
  }

  @Roles('registry')
  @Delete('check-out/:patient_id')
  @ApiOperation({
    summary: 'Check out a patient',
    description:
      'Archives and removes an active patient record from the live queue.',
  })
  @ApiParam({
    name: 'patient_id',
    description: 'Unique patient identifier (UUID).',
    example: 'd2adf8a2-8e62-4ec7-9589-4b78c41f6f85',
  })
  @ApiOkResponse({
    description: 'Patient successfully checked out and archived.',
    schema: {
      type: 'object',
      properties: {
        checked_out: { type: 'boolean', example: true },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Patient is not currently checked in.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient role. Only registry can check out patients.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Unable to complete patient check-out.',
  })
  checkOut(@Param('patient_id') patientId: string) {
    return this.patientService.checkOut(patientId);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Patch(':patient_id')
  @ApiOperation({
    summary: 'Update patient details',
    description:
      'Partially updates patient demographics or triage state. At least one field is required.',
  })
  @ApiParam({
    name: 'patient_id',
    description: 'Unique patient identifier (UUID).',
    example: 'd2adf8a2-8e62-4ec7-9589-4b78c41f6f85',
  })
  @ApiBody({
    description: 'Fields to update for the active patient record.',
    schema: {
      type: 'object',
      minProperties: 1,
      properties: {
        name: { type: 'string', minLength: 1, example: 'John D. Doe' },
        phone_number: {
          type: 'string',
          minLength: 1,
          example: '+359888654321',
        },
        triage_state: {
          type: 'string',
          enum: TRIAGE_STATE_ENUM,
          example: 'RED',
        },
      },
      example: {
        triage_state: 'RED',
        phone_number: '+359888654321',
      },
    },
  })
  @ApiOkResponse({
    description: 'Patient record updated successfully.',
    schema: patientSchema,
  })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiNotFoundResponse({ description: 'Patient is not currently checked in.' })
  @ApiConflictResponse({
    description:
      'Another active patient already uses the requested phone number.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role for this endpoint.' })
  @ApiServiceUnavailableResponse({
    description: 'Unable to update patient details at this time.',
  })
  async updatePatient(
    @Param('patient_id') patientId: string,
    @Body(new ZodValidationPipe(updatePatientPayloadSchema))
    body: UpdatePatientI,
  ) {
    return this.patientService.updatePatient(patientId, body);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Get('details/:patient_id')
  @ApiOperation({
    summary: 'Get patient details',
    description:
      'Returns the full patient view including current queue records and referral history.',
  })
  @ApiParam({
    name: 'patient_id',
    description: 'Unique patient identifier (UUID).',
    example: 'd2adf8a2-8e62-4ec7-9589-4b78c41f6f85',
  })
  @ApiOkResponse({
    description: 'Detailed patient data retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        ...patientSchema.properties,
        queue: {
          type: 'array',
          items: queueRecordSchema,
        },
        history: {
          type: 'array',
          items: historyRecordSchema,
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Patient is not currently checked in.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role for this endpoint.' })
  @ApiServiceUnavailableResponse({
    description: 'Unable to retrieve patient details.',
  })
  async getPatientDetails(@Param('patient_id') patientId: string) {
    return this.patientService.getPatientDetails(patientId);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Post('note/:patient_id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Attach a note to a patient',
    description:
      'Prepends a clinical or operational note to the active patient record.',
  })
  @ApiParam({
    name: 'patient_id',
    description: 'Unique patient identifier (UUID).',
    example: 'd2adf8a2-8e62-4ec7-9589-4b78c41f6f85',
  })
  @ApiBody({
    description: 'Note payload.',
    schema: {
      type: 'object',
      required: ['note'],
      properties: {
        note: {
          type: 'string',
          minLength: 1,
          example: 'Patient reports pain level 7/10 in left shoulder.',
        },
      },
      example: {
        note: 'Patient reports pain level 7/10 in left shoulder.',
      },
    },
  })
  @ApiOkResponse({ description: 'Note attached successfully.' })
  @ApiBadRequestResponse({ description: 'Request body failed validation.' })
  @ApiNotFoundResponse({ description: 'Patient is not currently checked in.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'Insufficient role for this endpoint.' })
  @ApiServiceUnavailableResponse({
    description: 'Unable to attach note to patient.',
  })
  async attachNote(
    @Param('patient_id') patientId: string,
    @Body(new ZodValidationPipe(attachPatientNotePayloadSchema))
    body: AttachPatientNotePayloadI,
  ): Promise<void> {
    await this.patientService.attachNote(patientId, body);
  }
}
