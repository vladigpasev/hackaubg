import { RedisService } from '../service/redis.service';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../shared.decoraters';
import z from 'zod';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { MatcherService } from '../service/matcher.service';
import { PatientDetailsResponseI } from '../patient/patient.dto';
import { fa } from 'zod/v4/locales';
import { StreamService } from '../service/stream.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/doctor')
export class DoctorController {
  constructor(
    private redisService: RedisService,
    private matcherService: MatcherService,
    private streamService: StreamService,
  ) {}

  @Roles('doctor')
  @Post('/status')
  async setOnline(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(z.object({ online: z.boolean() })))
    { online }: { online: boolean },
  ) {
    if (online) {
      this.redisService.client.del(`doctor:offline:${request.user.username}`);
      this.matcherService.matchPatientsToDoctor();
    } else
      this.redisService.client.set(
        `doctor:offline:${request.user.username}`,
        'true',
      );
  }

  @Roles('doctor')
  @Post('/free')
  async free(@Req() request: AuthenticatedRequest) {
    const currentPatientId = await this.redisService.client.get(
      `doctor:currentPatient:${request.user.username}`,
    );

    const patient: PatientDetailsResponseI = JSON.parse(
      (await this.redisService.client.get(
        `patient:record:${currentPatientId}`,
      )) ?? '',
    );

    await this.redisService.client.del(
      `doctor:currentPatient:${request.user.username}`,
    );

    const assignment = JSON.parse(
      (await this.redisService.client.get(
        `patient:current:${currentPatientId}`,
      )) as any,
    );
    await this.redisService.client.del(`patient:current:${currentPatientId}`);

    patient.history.push({
      reffered_by_id: assignment.reffered_by_id,
      specialty: assignment.specialty,
      triage_state: assignment.triage_state,
      reffered_to_id: request.user.username,
      is_done: request.user.isTester ? false : true,
      timestamp: new Date(),
    });

    await this.redisService.client.set(
      `patient:record:${currentPatientId}`,
      JSON.stringify(patient),
    );

    await this.matcherService.matchPatientsToDoctor(currentPatientId!);

    this.streamService.pushEvent({
      type: 'patient:update',
      data: {
        ...patient,
        queue: this.redisService.client.lRange(
          `patient:queue:${patient}`,
          0,
          -1,
        ),
      },
    });
  }
}
