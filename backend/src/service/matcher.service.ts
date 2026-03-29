import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { PatientDetailsResponseI } from '../patient/patient.dto';
import { QueueRecordI } from '../patient/patient.type';
import { User } from '../../generated/prisma/client';
import { StreamService } from './stream.service';

export const TRIAGE_COLORS = {
  YELLOW: 0,
  GREEN: 1,
  RED: 2,
};

export type Patient = {
  id: string;
  color: number;
  assignments: {
    specialty: string;
    color: number;
  }[];
};

export type Doctor = {
  id: string;
  specialties: string[];
};

@Injectable()
export class MatcherService implements OnModuleInit {
  private readonly specialtyWaterfalls = new Map<string, string[]>();
  public doctors: User[] = [];

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly streamService: StreamService,
  ) {}

  async onModuleInit() {
    const waterfalls = await this.prismaService.specialityWaterfall.findMany();
    for (const waterfall of waterfalls)
      this.specialtyWaterfalls.set(
        waterfall.speciality,
        JSON.parse(waterfall.waterfall),
      );

    this.doctors = await this.prismaService.user.findMany({
      where: { role: 'doctor' },
    });
  }

  async matchPatientsToDoctor(targetPatientId?: string): Promise<User | null> {
    const redis = this.redisService.client;

    const patientIds = (await redis.keys('patient:record:*')).map((key) =>
      key.slice(15),
    );

    const records: PatientDetailsResponseI[] = (
      await redis.mGet(patientIds.map((id) => `patient:record:${id}`))
    ).map((r) => JSON.parse(r!));

    const queues = await Promise.all(
      patientIds.map(
        (id) =>
          redis
            .lRange(`patient:queue:${id}`, 0, -1)
            .then((q) => q.map((v) => JSON.parse(v))) as Promise<
            QueueRecordI[]
          >,
      ),
    );

    for (let i = 0; i < records.length; i++) records[i].queue = queues[i];

    const takenDoctorIds = (await redis.keys('doctor:currentPatient:*')).map(
      (k) => k.slice(22),
    );

    const takenPatientIds: string[] = (await redis.mGet(
      takenDoctorIds.map((id) => `doctor:currentPatient:${id}`),
    )) as any;

    const offlineDoctorIds = (await redis.keys('doctor:offline:*')).map((k) =>
      k.slice(14),
    );

    const freeDoctors = this.doctors
      .filter(
        (doc) =>
          !takenDoctorIds.includes(doc.username) &&
          !offlineDoctorIds.includes(doc.username),
      )
      .map((doc) => ({
        id: doc.username,
        specialties: JSON.parse(doc.specialties),
      }));

    const waitingPatients = records
      .filter((patient) => !takenPatientIds.includes(patient.id))
      .map((patient) => ({
        id: patient.id,
        color: TRIAGE_COLORS[patient.triage_state],
        assignments: patient.queue.map((a) => ({
          specialty: a.specialty,
          color: TRIAGE_COLORS[a.triage_state],
        })),
      }));

    const matches = this.matchPatientsToDoctors_internal(
      waitingPatients,
      freeDoctors,
    );

    for (const match of matches) {
      await redis.set(
        `patient:current:${match.patient}`,
        JSON.stringify(match.assignment),
      );
      await redis.del(`patient:queue:${match.patient}`);
      await redis.zAdd(
        `patient:queue:${match.patient}`,
        records
          .find((r) => r.id === match.patient)!
          .queue.filter((a) => a.specialty !== match.assignment.specialty)
          .map((v) => ({
            value: JSON.stringify(v),
            score: TRIAGE_COLORS[v.triage_state],
          })),
      );

      this.streamService.pushEvent({
        type: 'patient:update',
        data: {
          id: match.patient,
          queue: this.redisService.client.lRange(
            `patient:queue:${match.patient}`,
            0,
            -1,
          ),
        },
      });
    }

    await redis.mSet(
      matches.map((m) => [`doctor:currentPatient:${m.doctor}`, m.patient]),
    );

    const targetDoctor = matches.find(
      (m) => m.patient === targetPatientId,
    )?.doctor;

    return targetDoctor
      ? this.doctors.find((d) => d.username === targetDoctor)!
      : null;
  }

  private matchPatientsToDoctors_internal(
    waitingPatients: Patient[],
    freeDoctors: { id: string; specialties: string[] }[],
  ): { doctor: string; patient: string; assignment: any }[] {
    const matches: any[] = [];

    const freeDoctorsBySpecialty = new Map<string, Doctor[]>();
    for (const doctor of freeDoctors) {
      for (const specialty of doctor.specialties) {
        if (!freeDoctorsBySpecialty.has(specialty))
          freeDoctorsBySpecialty.set(specialty, []);
        freeDoctorsBySpecialty.get(specialty)!.push(doctor);
      }
    }

    waitingPatients = [...waitingPatients].sort((a, b) => a.color - b.color);

    perPatient: for (const patient of waitingPatients) {
      const assignments: {
        specialty: string;
        color: number;
        specialtyOrder: number;
      }[] = patient.assignments
        .flatMap(
          (assignment) =>
            this.specialtyWaterfalls
              .get(assignment.specialty)
              ?.map((specialty, i) => ({
                specialty,
                color: assignment.color,
                specialtyOrder: i,
              })) ?? {
              specialty: assignment.specialty,
              color: assignment.color,
              specialtyOrder: 0,
            },
        )
        .sort((a, b) =>
          a.color === b.color
            ? a.specialtyOrder - b.specialtyOrder
            : a.color - b.color,
        );

      for (const assignment of assignments) {
        if (!freeDoctorsBySpecialty.has(assignment.specialty)) continue;

        const doctors = freeDoctorsBySpecialty.get(assignment.specialty)!;
        if (doctors.length === 0) continue;

        const doctor = doctors.pop()!;

        matches.push({
          doctor: doctor?.id,
          patient: patient.id,
          assignment,
        });

        continue perPatient;
      }
    }

    return matches;
  }
}
