import { RedisService } from '../service/redis.service';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../shared.decoraters';
import z from 'zod';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { MatcherService, TRIAGE_COLORS } from '../service/matcher.service';
import { PatientDetailsResponseI } from '../patient/patient.dto';
import { fa } from 'zod/v4/locales';
import { StreamService } from '../service/stream.service';

@UseGuards(JwtAuthGuard)
@Controller('/')
export class SendController {
  constructor(
    private redisService: RedisService,
    private matcherService: MatcherService,
    private streamService: StreamService,
  ) {}

  @Post('/sendPatient')
  async sendPatient(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          patient: z.string(),
          specialty: z.string(),
          triage: z.enum(['YELLOW', 'GREEN']).optional(),
        }),
      ),
    )
    {
      patient,
      specialty,
      triage,
    }: { patient: string; specialty: string; triage?: string },
  ) {
    this.redisService.client.zAdd(`patient:queue:${patient}`, [
      {
        score: TRIAGE_COLORS[triage ?? 'GREEN'],
        value: JSON.stringify({
          timestamp: new Date(),
          triage_state: triage ?? 'GREEN',
          specialty,
          reffered_by_id: request.user.username,
        }),
      },
    ]);

    await this.matcherService.matchPatientsToDoctor();

    this.streamService.pushEvent({
      type: 'patient:update',
      data: {
        id: patient,
        queue: this.redisService.client.lRange(
          `patient:queue:${patient}`,
          0,
          -1,
        ),
      },
    });
  }

  @Post('/finishTest')
  async finishTest(
    @Body(
      new ZodValidationPipe(
        z.object({
          patient: z.string(),
          specialty: z.string(),
        }),
      ),
    )
    { patient, specialty }: { patient: string; specialty: string },
  ) {
    const record: PatientDetailsResponseI = JSON.parse(
      (await this.redisService.client.get(`patient:record:${patient}`)) as any,
    );

    const test = record.history.find(
      (e) => e.is_done === false && e.specialty === specialty,
    );
    if (test == null) return;

    test.is_done = true;

    await this.redisService.client.set(
      `patient:record:${patient}`,
      JSON.stringify(record),
    );

    this.streamService.pushEvent({
      type: 'patient:update',
      data: record,
    });

    if (
      record.history.find(
        (e) => e.is_done === false && e.reffered_by_id === test.reffered_by_id,
      ) != null
    )
      return;

    const doctor = this.matcherService.doctors.find(
      (d) => d.username === test.reffered_by_id,
    );

    this.redisService.client.zAdd(`patient:queue:${patient}`, [
      {
        score: TRIAGE_COLORS[test.triage_state],
        value: JSON.stringify({
          timestamp: new Date(),
          triage_state: test.triage_state,
          specialty: doctor?.specialties
            ? JSON.parse(doctor.specialties)[0]
            : test.specialty,
          reffered_by_id: test.reffered_by_id,
        }),
      },
    ]);

    await this.matcherService.matchPatientsToDoctor();

    this.streamService.pushEvent({
      type: 'patient:update',
      data: {
        id: patient,
        queue: this.redisService.client.lRange(
          `patient:queue:${patient}`,
          0,
          -1,
        ),
      },
    });
  }
}
