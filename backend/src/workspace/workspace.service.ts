import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { User } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PatientService } from '../patient/patient.service';
import type { AttachPatientNotePayloadI } from '../patient/patient.dto';
import { PrismaService } from '../service/prisma.service';
import { RedisService } from '../service/redis.service';
import { StreamService } from '../service/stream.service';
import {
  buildServerNotes,
  getDoctorVisits,
  getLabBatches,
  isVisitBlocked,
  projectPatientDetailsFromAgenda,
  toPatientDoctorVisit,
  toPatientLabBatch,
  triageToAssignmentCode,
} from './workspace.projection';
import {
  buildDoctorProfileId,
  normalizeWorkspaceValue,
  parseStoredStringArray,
  readStoredPatientAgenda,
  readStoredPatientNotifications,
  titleCaseWorkspaceValue,
  writeStoredPatientAgenda,
  writeStoredPatientNotifications,
} from './workspace.store';
import type {
  AddAssignmentsPayloadI,
  AssignmentCode,
  CatalogOption,
  DoctorProfile,
  HospitalMutationResult,
  HospitalSnapshot,
  Patient,
  StoredDoctorVisit,
  StoredLabBatch,
  StoredLabItem,
  StoredPatientAgendaEntry,
  StoredPatientNotification,
  WorkspaceBootstrapResponse,
  WorkspaceCatalogs,
  WorkspaceNotePayloadI,
  WorkspacePatientCore,
  WorkspacePatientDetails,
} from './workspace.types';

type ActivePatientState = {
  core: WorkspacePatientCore;
  detail: WorkspacePatientDetails | null;
  agenda: StoredPatientAgendaEntry[];
  notifications: StoredPatientNotification[];
};

type SnapshotState = {
  doctors: DoctorProfile[];
  offlineDoctorUsernames: Set<string>;
  patients: ActivePatientState[];
};

type AgendaCandidate = {
  code: AssignmentCode;
  createdAt: string;
  id: string;
  status: 'queued' | 'with_staff' | 'not_here';
  title: string;
};

const LAB_TEST_CATALOG: CatalogOption[] = [
  {
    id: 'test-blood',
    kind: 'lab',
    keywords: ['bloodwork', 'cbc', 'blood'],
    label: 'Blood Test',
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-ecg',
    kind: 'lab',
    keywords: ['ecg', 'ekg', 'heart'],
    label: 'ECG',
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-urine',
    kind: 'lab',
    keywords: ['urine', 'sample'],
    label: 'Urine Test',
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-xray',
    kind: 'lab',
    keywords: ['xray', 'x-ray', 'lungs'],
    label: 'Chest X-Ray',
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-ct',
    kind: 'lab',
    keywords: ['ct', 'scan'],
    label: 'CT Scan',
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-mri',
    kind: 'lab',
    keywords: ['mri', 'scan'],
    label: 'MRI',
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-ultrasound',
    kind: 'lab',
    keywords: ['ultrasound', 'echo'],
    label: 'Ultrasound',
    testerSpecialty: 'Radiology',
  },
];

const WORKSPACE_QUEUE_LOCK_KEY = 'workspace:queue:lock';
const WORKSPACE_QUEUE_LOCK_TTL_MS = 5_000;

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function normalizeSpecialty(value: string): string {
  const normalizedValue = normalizeWorkspaceValue(value);

  if (
    normalizedValue === 'blood-test' ||
    normalizedValue === 'blood test' ||
    normalizedValue === 'lab'
  ) {
    return 'laboratory medicine';
  }

  if (normalizedValue === 'scanner' || normalizedValue === 'imaging') {
    return 'radiology';
  }

  return normalizedValue;
}

function isLabSpecialty(specialty: string): boolean {
  const normalizedSpecialty = normalizeSpecialty(specialty);

  if (
    normalizedSpecialty === 'laboratory medicine' ||
    normalizedSpecialty === 'radiology'
  ) {
    return true;
  }

  return [
    'blood-test',
    'urinalysis',
    'imaging',
    'scanner',
    'x-ray',
    'ct-scan',
    'ultrasound',
    'echocardiogram',
  ].includes(normalizeWorkspaceValue(specialty));
}

function isLabCollectionCompleteStatus(
  status: StoredLabItem['status'],
): boolean {
  return status === 'taken' || status === 'results_ready';
}

function getDoctorDisplayName(user: User): string {
  if (user.username.startsWith('doctor.')) {
    return `Dr. ${titleCaseWorkspaceValue(user.username.slice(7))}`;
  }

  return titleCaseWorkspaceValue(user.username);
}

function compareByCodeAndTime(
  leftCode: AssignmentCode,
  leftStatus:
    | 'queued'
    | 'with_staff'
    | 'not_here'
    | 'done'
    | 'taken'
    | 'results_ready',
  leftCreatedAt: string,
  leftId: string,
  rightCode: AssignmentCode,
  rightStatus:
    | 'queued'
    | 'with_staff'
    | 'not_here'
    | 'done'
    | 'taken'
    | 'results_ready',
  rightCreatedAt: string,
  rightId: string,
): number {
  if (leftStatus === 'with_staff' || rightStatus === 'with_staff') {
    if (leftStatus === rightStatus) {
      return 0;
    }

    return leftStatus === 'with_staff' ? -1 : 1;
  }

  const leftStatusRank =
    leftStatus === 'queued' ? 0 : leftStatus === 'not_here' ? 1 : 2;
  const rightStatusRank =
    rightStatus === 'queued' ? 0 : rightStatus === 'not_here' ? 1 : 2;

  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank;
  }

  const codeDelta =
    (leftCode === 'YELLOW' ? 0 : 1) - (rightCode === 'YELLOW' ? 0 : 1);

  if (codeDelta !== 0) {
    return codeDelta;
  }

  const createdAtDelta = timestamp(leftCreatedAt) - timestamp(rightCreatedAt);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return leftId.localeCompare(rightId);
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly patientService: PatientService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly streamService: StreamService,
  ) {}

  async getBootstrap(
    activeUser: AuthUser,
  ): Promise<WorkspaceBootstrapResponse> {
    const snapshot = await this.loadSnapshot(activeUser);
    return {
      snapshot,
      catalogs: this.buildCatalogs(snapshot.doctors),
    };
  }

  async markNotificationRead(
    activeUser: AuthUser,
    notificationId: string,
  ): Promise<HospitalSnapshot> {
    const normalizedNotificationId = notificationId.trim();

    if (!normalizedNotificationId) {
      throw new BadRequestException('notificationId is required');
    }

    const state = await this.loadSnapshotState();
    let touchedPatientId: string | null = null;

    for (const patientState of state.patients) {
      const notification = patientState.notifications.find(
        (candidate) => candidate.id === normalizedNotificationId,
      );

      if (!notification) {
        continue;
      }

      if (!notification.readAt) {
        notification.readAt = new Date().toISOString();
        await writeStoredPatientNotifications(
          this.redisService.client,
          patientState.core.id,
          patientState.notifications,
        );
        touchedPatientId = patientState.core.id;
      }

      break;
    }

    if (!touchedPatientId) {
      throw new NotFoundException('Notification was not found.');
    }

    this.pushWorkspaceRefreshEvent(touchedPatientId);
    return this.loadSnapshot(activeUser);
  }

  async addPatientNote(
    activeUser: AuthUser,
    patientId: string,
    payload: WorkspaceNotePayloadI,
  ): Promise<HospitalMutationResult> {
    const normalizedPatientId = patientId.trim();

    await this.patientService.attachNote(normalizedPatientId, {
      note: payload.note,
    } satisfies AttachPatientNotePayloadI);

    this.pushWorkspaceRefreshEvent(normalizedPatientId);
    return this.buildMutationResult(activeUser, normalizedPatientId);
  }

  async addAssignments(
    activeUser: AuthUser,
    patientId: string,
    payload: AddAssignmentsPayloadI,
  ): Promise<HospitalMutationResult> {
    return this.withQueueMutationLock(async () => {
      const normalizedPatientId = patientId.trim();
      const state = await this.loadSnapshotState();
      const patientState = this.findPatientStateOrThrow(
        state,
        normalizedPatientId,
      );
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      const actorLabel = this.getActorLabel(activeUser, state.doctors);
      const now = new Date().toISOString();
      const doctorDrafts = payload.assignments.filter(
        (draft) => draft.destinationKind === 'doctor',
      );
      const labDrafts = payload.assignments.filter(
        (draft) => draft.destinationKind === 'lab',
      );

      if (
        labDrafts.length > 0 &&
        (activeUser.role !== 'doctor' || activeUser.isTester)
      ) {
        throw new ConflictException(
          'Only non-tester doctors can assign lab items.',
        );
      }

      const sourceVisit = this.resolveSourceVisit(
        patientState,
        payload.sourceVisitId ?? null,
        activeUser,
      );

      if (labDrafts.length > 0) {
        if (
          !sourceVisit ||
          sourceVisit.assignedDoctorUsername !== activeUser.username ||
          sourceVisit.status !== 'with_staff'
        ) {
          throw new ConflictException(
            'Select one of your own active doctor visits before ordering lab work.',
          );
        }

        sourceVisit.completedAt = now;
        sourceVisit.status = 'done';
        sourceVisit.updatedAt = now;
      }

      const blockingBatchId =
        labDrafts.length > 0 ? this.buildLabBatchId() : null;

      if (labDrafts.length > 0 && sourceVisit) {
        const items = labDrafts.map((draft) => {
          const catalogItem = this.getCatalogTestOrThrow(draft.label);

          return {
            id: this.buildLabItemId(),
            testName: catalogItem.label,
            testerSpecialty: catalogItem.testerSpecialty,
            assignedDoctorUsername: null,
            code: draft.code,
            status: 'queued',
            createdAt: now,
            updatedAt: now,
            takenAt: null,
            resultsReadyAt: null,
            takenByActorId: null,
            takenByLabel: null,
            resultsReadyByActorId: null,
            resultsReadyByLabel: null,
            queueOrder: 0,
          } satisfies StoredLabItem;
        });

        patientState.agenda.push({
          id: blockingBatchId!,
          entryType: 'lab_batch',
          status: 'collecting',
          orderedByActorId: activeUser.username,
          orderedByLabel: actorLabel,
          returnDoctorUsername: sourceVisit.assignedDoctorUsername,
          returnSpecialty: sourceVisit.specialty,
          returnCode: sourceVisit.code,
          note: payload.note.trim(),
          createdAt: now,
          updatedAt: now,
          resultsReadyAt: null,
          returnCreatedAt: null,
          sourceVisitId: sourceVisit.id,
          items,
        } satisfies StoredLabBatch);
      }

      for (const draft of doctorDrafts) {
        patientState.agenda.push({
          id: this.buildDoctorVisitId(),
          entryType: 'doctor_visit',
          specialty: draft.label.trim(),
          requestedByActorId: activeUser.username,
          requestedByLabel: actorLabel,
          assignedDoctorUsername: null,
          code: draft.code,
          status: 'queued',
          note: '',
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          sourceVisitId: sourceVisit?.id ?? null,
          blockedByBatchId: blockingBatchId,
          isReturnVisit: false,
          queueOrder: 0,
        } satisfies StoredDoctorVisit);
      }

      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(normalizedPatientId);
      return this.buildMutationResult(activeUser, normalizedPatientId);
    });
  }

  async acceptNextDoctorVisit(
    activeUser: AuthUser,
  ): Promise<HospitalMutationResult> {
    if (activeUser.role !== 'doctor' || activeUser.isTester) {
      throw new ConflictException(
        'Only non-tester doctors can accept the next patient.',
      );
    }

    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();

      if (this.findCurrentDoctorVisit(state, activeUser.username)) {
        throw new ConflictException(
          'Finish or release your current patient before accepting the next one.',
        );
      }

      const candidate = this.findNextDoctorVisitCandidate(state, activeUser);

      if (!candidate) {
        throw new NotFoundException(
          'No patient is waiting in your shared specialty queue.',
        );
      }

      const now = new Date().toISOString();
      candidate.visit.status = 'with_staff';
      candidate.visit.assignedDoctorUsername = activeUser.username;
      candidate.visit.updatedAt = now;
      this.reconcileAssignments(state);
      await this.persistPatientState(candidate.patientState);
      this.pushWorkspaceRefreshEvent(candidate.patientState.core.id);
      return this.buildMutationResult(activeUser, candidate.patientState.core.id);
    });
  }

  async startDoctorVisit(
    activeUser: AuthUser,
    visitId: string,
  ): Promise<HospitalMutationResult> {
    void activeUser;
    void visitId;
    throw new ConflictException(
      'Manual patient selection is no longer supported. Accept the next patient instead.',
    );
  }

  async markDoctorVisitNotHere(
    activeUser: AuthUser,
    visitId: string,
  ): Promise<HospitalMutationResult> {
    if (activeUser.role !== 'doctor' || activeUser.isTester) {
      throw new ConflictException(
        'Only non-tester doctors can update doctor visits.',
      );
    }

    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();
      const { patientState, visit } = this.findVisitByIdOrThrow(state, visitId);
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );

      if (
        visit.assignedDoctorUsername !== activeUser.username ||
        visit.status !== 'with_staff'
      ) {
        throw new ConflictException(
          'Only your current patient can be marked as not here.',
        );
      }

      const now = new Date().toISOString();
      visit.status = 'not_here';
      visit.assignedDoctorUsername = visit.isReturnVisit
        ? activeUser.username
        : null;
      visit.updatedAt = now;
      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(patientState.core.id);
      return this.buildMutationResult(activeUser, patientState.core.id);
    });
  }

  async completeDoctorVisit(
    activeUser: AuthUser,
    visitId: string,
  ): Promise<HospitalMutationResult> {
    if (activeUser.role !== 'doctor' || activeUser.isTester) {
      throw new ConflictException(
        'Only non-tester doctors can complete doctor visits.',
      );
    }

    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();
      const { patientState, visit } = this.findVisitByIdOrThrow(state, visitId);
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );

      if (
        visit.assignedDoctorUsername !== activeUser.username ||
        visit.status !== 'with_staff'
      ) {
        throw new ConflictException(
          'Only your current patient can be completed.',
        );
      }

      const now = new Date().toISOString();
      visit.completedAt = now;
      visit.status = 'done';
      visit.updatedAt = now;
      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(patientState.core.id);
      return this.buildMutationResult(activeUser, patientState.core.id);
    });
  }

  async acceptNextLabItem(
    activeUser: AuthUser,
  ): Promise<HospitalMutationResult> {
    this.assertTester(activeUser);

    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();

      if (this.findCurrentLabItem(state, activeUser.username)) {
        throw new ConflictException(
          'Finish or release your current patient before accepting the next one.',
        );
      }

      const candidate = this.findNextLabItemCandidate(state, activeUser);

      if (!candidate) {
        throw new NotFoundException(
          'No patient is waiting in your shared specialty queue.',
        );
      }

      const now = new Date().toISOString();
      candidate.item.status = 'with_staff';
      candidate.item.assignedDoctorUsername = activeUser.username;
      candidate.item.updatedAt = now;
      candidate.batch.updatedAt = now;
      this.reconcileAssignments(state);
      await this.persistPatientState(candidate.patientState);
      this.pushWorkspaceRefreshEvent(candidate.patientState.core.id);
      return this.buildMutationResult(activeUser, candidate.patientState.core.id);
    });
  }

  async startLabItem(
    activeUser: AuthUser,
    itemId: string,
  ): Promise<HospitalMutationResult> {
    void activeUser;
    void itemId;
    throw new ConflictException(
      'Manual patient selection is no longer supported. Accept the next patient instead.',
    );
  }

  async markLabItemNotHere(
    activeUser: AuthUser,
    itemId: string,
  ): Promise<HospitalMutationResult> {
    this.assertTester(activeUser);
    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();
      const { patientState, batch, item } = this.findLabItemByIdOrThrow(
        state,
        itemId,
      );
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );

      if (
        item.assignedDoctorUsername !== activeUser.username ||
        item.status !== 'with_staff'
      ) {
        throw new ConflictException(
          'Only your current lab patient can be marked as not here.',
        );
      }

      const now = new Date().toISOString();
      item.status = 'not_here';
      item.assignedDoctorUsername = null;
      item.updatedAt = now;
      batch.updatedAt = now;
      this.syncLabBatchStatus(batch);
      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(patientState.core.id);
      return this.buildMutationResult(activeUser, patientState.core.id);
    });
  }

  async markLabItemTaken(
    activeUser: AuthUser,
    itemId: string,
  ): Promise<HospitalMutationResult> {
    this.assertTester(activeUser);
    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();
      const { patientState, batch, item } = this.findLabItemByIdOrThrow(
        state,
        itemId,
      );
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );

      if (
        item.assignedDoctorUsername !== activeUser.username ||
        item.status !== 'with_staff'
      ) {
        throw new ConflictException(
          'Only your current lab patient can be marked as taken.',
        );
      }

      const now = new Date().toISOString();
      item.status = 'taken';
      item.takenAt = now;
      item.takenByActorId = activeUser.username;
      item.takenByLabel = this.getActorLabel(activeUser, state.doctors);
      item.assignedDoctorUsername = null;
      item.updatedAt = now;
      item.queueOrder = 0;
      batch.updatedAt = now;
      this.syncLabBatchStatus(batch);

      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(patientState.core.id);
      return this.buildMutationResult(activeUser, patientState.core.id);
    });
  }

  async markLabItemResultsReady(
    activeUser: AuthUser,
    itemId: string,
  ): Promise<HospitalMutationResult> {
    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();
      const { patientState, batch, item } = this.findLabItemByIdOrThrow(
        state,
        itemId,
      );
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );

      if (item.status === 'results_ready') {
        return this.buildMutationResult(activeUser, patientState.core.id);
      }

      if (item.status !== 'taken') {
        throw new ConflictException(
          'Only taken lab items can be marked as results ready.',
        );
      }

      const now = new Date().toISOString();
      item.status = 'results_ready';
      item.resultsReadyAt = now;
      item.resultsReadyByActorId = activeUser.username;
      item.resultsReadyByLabel = this.getActorLabel(activeUser, state.doctors);
      item.updatedAt = now;
      batch.updatedAt = now;
      this.syncLabBatchStatus(batch);

      if (
        batch.items.every((candidate) => candidate.status === 'results_ready')
      ) {
        this.finalizeLabBatchReturn(state, patientState, batch, activeUser, now);
      }

      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(patientState.core.id);
      return this.buildMutationResult(activeUser, patientState.core.id);
    });
  }

  async markLabResultsReady(
    activeUser: AuthUser,
    batchId: string,
  ): Promise<HospitalMutationResult> {
    return this.withQueueMutationLock(async () => {
      const state = await this.loadSnapshotState();
      const { patientState, batch } = this.findLabBatchByIdOrThrow(
        state,
        batchId,
      );
      const beforePatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );

      if (batch.status !== 'waiting_results') {
        throw new ConflictException(
          'All lab items must be taken before results can be released.',
        );
      }

      const now = new Date().toISOString();
      const actorLabel = this.getActorLabel(activeUser, state.doctors);

      for (const item of batch.items) {
        if (item.status === 'taken') {
          item.status = 'results_ready';
          item.resultsReadyAt = now;
          item.resultsReadyByActorId = activeUser.username;
          item.resultsReadyByLabel = actorLabel;
          item.updatedAt = now;
        }
      }

      this.syncLabBatchStatus(batch);
      this.finalizeLabBatchReturn(state, patientState, batch, activeUser, now);
      batch.updatedAt = now;

      this.reconcileAssignments(state);
      const afterPatient = this.buildPatientSnapshot(
        state.doctors,
        patientState,
      );
      this.maybeCreateGuidanceNotification(
        patientState.notifications,
        beforePatient,
        afterPatient,
        now,
      );
      await this.persistPatientState(patientState);
      this.pushWorkspaceRefreshEvent(patientState.core.id);
      return this.buildMutationResult(activeUser, patientState.core.id);
    });
  }

  private async buildMutationResult(
    activeUser: AuthUser,
    patientId: string,
  ): Promise<HospitalMutationResult> {
    const snapshot = await this.loadSnapshot(activeUser);
    const patient = snapshot.patients.find(
      (candidate) => candidate.id === patientId,
    );

    if (!patient) {
      throw new NotFoundException('Patient details are unavailable right now.');
    }

    return {
      doctors: snapshot.doctors,
      notifications: snapshot.notifications,
      patient,
      patients: snapshot.patients,
    };
  }

  private async loadSnapshot(activeUser: AuthUser): Promise<HospitalSnapshot> {
    void activeUser;
    const state = await this.loadSnapshotState();
    return this.buildSnapshotFromState(state);
  }

  private async loadSnapshotState(): Promise<SnapshotState> {
    const client = this.redisService.client;
    const [rawDoctors, offlineDoctorKeys, cores] = await Promise.all([
      this.prismaService.user.findMany({
        where: { role: 'doctor' },
        orderBy: { username: 'asc' },
      }),
      client.keys('doctor:offline:*'),
      this.patientService.getAllPatients(),
    ]);

    const doctors = rawDoctors.map((doctor) => this.toDoctorProfile(doctor));
    const offlineDoctorUsernames = new Set(
      offlineDoctorKeys.map((key) => key.slice('doctor:offline:'.length)),
    );
    const patients: ActivePatientState[] = [];
    let shouldPersistState = false;

    for (const coreRecord of cores) {
      const core = this.toWorkspacePatientCore(coreRecord);
      const detail = this.toWorkspacePatientDetails(
        await this.patientService.getPatientDetails(core.id),
      );
      let agenda = await readStoredPatientAgenda(client, core.id);

      if (agenda.length === 0) {
        agenda = this.buildAgendaFromPatientDetail(core, detail);

        if (agenda.length > 0) {
          await writeStoredPatientAgenda(client, core.id, agenda);
        }
      }

      const rawNotifications = await readStoredPatientNotifications(
        client,
        core.id,
      );
      const notifications = rawNotifications.filter(
        (notification) => notification.type !== 'doctor_queue',
      );

      if (notifications.length !== rawNotifications.length) {
        shouldPersistState = true;
      }

      patients.push({
        core,
        detail,
        agenda,
        notifications,
      });
    }

    const state = {
      doctors,
      offlineDoctorUsernames,
      patients,
    };

    shouldPersistState = this.reconcileAssignments(state) || shouldPersistState;

    if (shouldPersistState) {
      for (const patientState of state.patients) {
        await this.persistPatientState(patientState);
      }
    }

    return state;
  }

  private buildSnapshotFromState(state: SnapshotState): HospitalSnapshot {
    return {
      doctors: state.doctors.map((doctor) => ({
        ...doctor,
        specialties: [...doctor.specialties],
      })),
      notifications: state.patients
        .flatMap((patientState) =>
          patientState.notifications.map((notification) =>
            this.toWorkspaceNotification(state.doctors, notification),
          ),
        )
        .sort((left, right) => {
          const createdAtDelta =
            timestamp(right.createdAt) - timestamp(left.createdAt);

          if (createdAtDelta !== 0) {
            return createdAtDelta;
          }

          return right.id.localeCompare(left.id);
        }),
      patients: state.patients.map((patientState) =>
        this.buildPatientSnapshot(state.doctors, patientState),
      ),
    };
  }

  private buildPatientSnapshot(
    doctors: DoctorProfile[],
    patientState: ActivePatientState,
  ): Patient {
    const usernameToId = new Map(
      doctors.map((doctor) => [doctor.username, doctor.id] as const),
    );
    const agenda = patientState.agenda.map((entry) => {
      if (entry.entryType === 'doctor_visit') {
        return toPatientDoctorVisit(
          entry,
          entry.assignedDoctorUsername
            ? (usernameToId.get(entry.assignedDoctorUsername) ?? null)
            : null,
        );
      }

      const itemDoctorIds = new Map(
        entry.items.map((item) => [
          item.id,
          item.assignedDoctorUsername
            ? (usernameToId.get(item.assignedDoctorUsername) ?? null)
            : null,
        ]),
      );

      return toPatientLabBatch(
        entry,
        entry.orderedByActorId
          ? (usernameToId.get(entry.orderedByActorId) ?? null)
          : null,
        entry.returnDoctorUsername
          ? (usernameToId.get(entry.returnDoctorUsername) ?? null)
          : null,
        itemDoctorIds,
      );
    });

    const detail =
      patientState.detail ??
      projectPatientDetailsFromAgenda(patientState.core, patientState.agenda);

    return {
      id: patientState.core.id,
      name: patientState.core.name,
      phoneNumber: patientState.core.phoneNumber,
      defaultCode: triageToAssignmentCode(patientState.core.triageState),
      admittedAt: patientState.core.admittedAt,
      notes: buildServerNotes(patientState.core),
      agenda,
      checkedOutAt: null,
      core: {
        ...patientState.core,
        notes: [...patientState.core.notes],
      },
      detail,
      lastUpdatedAt: new Date(
        patientState.agenda.reduce(
          (latest, entry) => Math.max(latest, timestamp(entry.updatedAt)),
          timestamp(patientState.core.admittedAt),
        ),
      ).toISOString(),
      overlay: { agenda },
    };
  }

  private toDoctorProfile(user: User): DoctorProfile {
    return {
      id: buildDoctorProfileId(user.username),
      username: user.username,
      displayName: getDoctorDisplayName(user),
      specialties: parseStoredStringArray(user.specialties).map((specialty) =>
        titleCaseWorkspaceValue(specialty),
      ),
      isTester: user.isTester,
    };
  }

  private buildCatalogs(doctors: DoctorProfile[]): WorkspaceCatalogs {
    const specialtyCatalog: CatalogOption[] = [];
    const seenSpecialties = new Set<string>();

    for (const doctor of doctors.filter((candidate) => !candidate.isTester)) {
      for (const specialty of doctor.specialties) {
        const normalizedSpecialty = normalizeWorkspaceValue(specialty);

        if (seenSpecialties.has(normalizedSpecialty)) {
          continue;
        }

        seenSpecialties.add(normalizedSpecialty);
        specialtyCatalog.push({
          id: `sp-runtime-${normalizedSpecialty.replace(/[^a-z0-9]+/g, '-')}`,
          kind: 'doctor',
          label: specialty,
          keywords: [],
        });
      }
    }

    return {
      specialties: specialtyCatalog.sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
      labTests: LAB_TEST_CATALOG.map((option) => ({
        ...option,
        keywords: [...option.keywords],
      })),
    };
  }

  private toWorkspaceNotification(
    doctors: DoctorProfile[],
    notification: StoredPatientNotification,
  ) {
    return {
      ...notification,
      targetDoctorId: notification.targetDoctorUsername
        ? (doctors.find(
            (doctor) => doctor.username === notification.targetDoctorUsername,
          )?.id ?? null)
        : null,
    };
  }

  private toWorkspacePatientCore(
    patient: Awaited<ReturnType<PatientService['getAllPatients']>>[number],
  ): WorkspacePatientCore {
    return {
      id: patient.id,
      name: patient.name,
      phoneNumber: patient.phone_number,
      triageState: patient.triage_state,
      admittedAt: patient.admitted_at.toISOString(),
      notes: [...patient.notes],
    };
  }

  private toWorkspacePatientDetails(
    patient: Awaited<ReturnType<PatientService['getPatientDetails']>>,
  ): WorkspacePatientDetails {
    return {
      id: patient.id,
      name: patient.name,
      phoneNumber: patient.phone_number,
      triageState: patient.triage_state,
      admittedAt: patient.admitted_at.toISOString(),
      notes: [...patient.notes],
      queue: patient.queue.map((entry) => ({
        timestamp: entry.timestamp.toISOString(),
        triageState: entry.triage_state,
        specialty: entry.specialty,
        referredById: entry.reffered_by_id,
      })),
      history: patient.history.map((entry) => ({
        referredById: entry.reffered_by_id,
        specialty: entry.specialty,
        triageState: entry.triage_state,
        referredToId: entry.reffered_to_id,
        isDone: entry.is_done,
        timestamp: entry.timestamp.toISOString(),
      })),
    };
  }

  private buildAgendaFromPatientDetail(
    core: WorkspacePatientCore,
    detail: WorkspacePatientDetails | null,
  ): StoredPatientAgendaEntry[] {
    if (!detail) {
      return [];
    }

    const completedDoctorVisits = detail.history
      .filter((entry) => entry.isDone && !isLabSpecialty(entry.specialty))
      .map(
        (entry, index) =>
          ({
            id: `server-visit:${core.id}:${normalizeWorkspaceValue(entry.specialty)}:${index}`,
            entryType: 'doctor_visit',
            specialty: entry.specialty,
            requestedByActorId: entry.referredById,
            requestedByLabel: this.buildServerActorLabel(entry.referredById),
            assignedDoctorUsername: entry.referredToId,
            code: triageToAssignmentCode(entry.triageState),
            status: 'done',
            note: '',
            createdAt: entry.timestamp,
            updatedAt: entry.timestamp,
            completedAt: entry.timestamp,
            sourceVisitId: null,
            blockedByBatchId: null,
            isReturnVisit: false,
            queueOrder: 0,
          }) satisfies StoredDoctorVisit,
      );

    const activeQueueEntries = detail.queue.map((entry, index) => {
      const normalizedCode = triageToAssignmentCode(entry.triageState);
      const createdAt = entry.timestamp;

      if (isLabSpecialty(entry.specialty)) {
        return {
          id: `server-lab-batch:${core.id}:${normalizeWorkspaceValue(entry.specialty)}:${index}`,
          entryType: 'lab_batch',
          status: 'collecting',
          orderedByActorId: entry.referredById,
          orderedByLabel: this.buildServerActorLabel(entry.referredById),
          returnDoctorUsername: null,
          returnSpecialty: entry.specialty,
          returnCode: normalizedCode,
          note: '',
          createdAt,
          updatedAt: createdAt,
          resultsReadyAt: null,
          returnCreatedAt: null,
          sourceVisitId: `server-source:${core.id}:${index}`,
          items: [
            {
              id: `server-lab-item:${core.id}:${normalizeWorkspaceValue(entry.specialty)}:${index}`,
              testName: entry.specialty,
              testerSpecialty: entry.specialty,
              assignedDoctorUsername: null,
              code: normalizedCode,
              status: 'queued',
              createdAt,
              updatedAt: createdAt,
              takenAt: null,
              resultsReadyAt: null,
              takenByActorId: null,
              takenByLabel: null,
              resultsReadyByActorId: null,
              resultsReadyByLabel: null,
              queueOrder: 0,
            },
          ],
        } satisfies StoredLabBatch;
      }

      return {
        id: `server-visit:${core.id}:${normalizeWorkspaceValue(entry.specialty)}:queued:${index}`,
        entryType: 'doctor_visit',
        specialty: entry.specialty,
        requestedByActorId: entry.referredById,
        requestedByLabel: this.buildServerActorLabel(entry.referredById),
        assignedDoctorUsername: null,
        code: normalizedCode,
        status: 'queued',
        note: '',
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
        sourceVisitId: null,
        blockedByBatchId: null,
        isReturnVisit: false,
        queueOrder: 0,
      } satisfies StoredDoctorVisit;
    });

    return [...completedDoctorVisits, ...activeQueueEntries];
  }

  private buildServerActorLabel(actorId: string): string {
    return actorId
      .split('.')
      .filter(Boolean)
      .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`)
      .join(' ');
  }

  private syncLabBatchStatus(batch: StoredLabBatch): void {
    if (batch.status === 'return_created') {
      return;
    }

    if (batch.items.every((item) => item.status === 'results_ready')) {
      batch.status = 'results_ready';
      return;
    }

    if (
      batch.items.every((item) => isLabCollectionCompleteStatus(item.status))
    ) {
      batch.status = 'waiting_results';
      return;
    }

    batch.status = 'collecting';
  }

  private finalizeLabBatchReturn(
    _state: SnapshotState,
    patientState: ActivePatientState,
    batch: StoredLabBatch,
    activeUser: AuthUser,
    now: string,
  ): void {
    if (batch.status === 'return_created') {
      return;
    }

    if (!batch.items.every((item) => item.status === 'results_ready')) {
      return;
    }

    const existingReturnVisit = getDoctorVisits(patientState.agenda).find(
      (visit) =>
        visit.isReturnVisit &&
        visit.sourceVisitId === batch.sourceVisitId &&
        visit.specialty === batch.returnSpecialty,
    );

    if (!existingReturnVisit) {
      patientState.agenda.push({
        id: this.buildDoctorVisitId(),
        entryType: 'doctor_visit',
        specialty: batch.returnSpecialty,
        requestedByActorId: batch.returnDoctorUsername ?? activeUser.username,
        requestedByLabel: batch.orderedByLabel,
        assignedDoctorUsername: batch.returnDoctorUsername,
        code: batch.returnCode,
        status: 'queued',
        note: 'Return visit after lab results.',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        sourceVisitId: batch.sourceVisitId,
        blockedByBatchId: null,
        isReturnVisit: true,
        queueOrder: 0,
      } satisfies StoredDoctorVisit);
    } else {
      existingReturnVisit.requestedByActorId =
        batch.returnDoctorUsername ?? activeUser.username;
      existingReturnVisit.requestedByLabel = batch.orderedByLabel;
      existingReturnVisit.assignedDoctorUsername = batch.returnDoctorUsername;
      existingReturnVisit.status = 'queued';
      existingReturnVisit.updatedAt = now;
    }

    batch.resultsReadyAt = now;
    batch.returnCreatedAt = now;
    batch.status = 'return_created';
  }

  private reconcileAssignments(state: SnapshotState): boolean {
    let changed = false;

    changed = this.normalizeCurrentDoctorAssignments(state) || changed;
    changed = this.normalizeCurrentLabAssignments(state) || changed;

    for (const patientState of state.patients) {
      for (const visit of getDoctorVisits(patientState.agenda)) {
        if (visit.status === 'done') {
          if (visit.queueOrder !== 0) {
            visit.queueOrder = 0;
            changed = true;
          }
          continue;
        }

        if (visit.status === 'with_staff') {
          const isAssignedDoctorValid =
            visit.assignedDoctorUsername &&
            state.doctors.some(
              (doctor) =>
                doctor.username === visit.assignedDoctorUsername &&
                !doctor.isTester,
            );

          if (!isAssignedDoctorValid) {
            visit.status = 'queued';
            visit.assignedDoctorUsername = null;
            changed = true;
          }

          if (visit.queueOrder !== 0) {
            visit.queueOrder = 0;
            changed = true;
          }
          continue;
        }

        const isReservedReturnDoctorValid =
          visit.isReturnVisit &&
          visit.assignedDoctorUsername &&
          state.doctors.some(
            (doctor) =>
              doctor.username === visit.assignedDoctorUsername &&
              !doctor.isTester,
          );

        if (!isReservedReturnDoctorValid && visit.assignedDoctorUsername !== null) {
          visit.assignedDoctorUsername = null;
          changed = true;
        }
      }

      for (const batch of getLabBatches(patientState.agenda)) {
        for (const item of batch.items) {
          if (item.status === 'taken' || item.status === 'results_ready') {
            if (item.assignedDoctorUsername !== null) {
              item.assignedDoctorUsername = null;
              changed = true;
            }

            if (item.queueOrder !== 0) {
              item.queueOrder = 0;
              changed = true;
            }
            continue;
          }

          if (item.status === 'with_staff') {
            const isAssignedDoctorValid =
              item.assignedDoctorUsername &&
              state.doctors.some(
                (doctor) =>
                  doctor.username === item.assignedDoctorUsername &&
                  doctor.isTester,
              );

            if (!isAssignedDoctorValid) {
              item.status = 'queued';
              item.assignedDoctorUsername = null;
              changed = true;
            }

            if (item.queueOrder !== 0) {
              item.queueOrder = 0;
              changed = true;
            }
            continue;
          }

          if (item.assignedDoctorUsername !== null) {
            item.assignedDoctorUsername = null;
            changed = true;
          }
        }
      }
    }

    changed = this.reindexDoctorQueueOrder(state) || changed;
    changed = this.reindexLabQueueOrder(state) || changed;

    return changed;
  }

  private normalizeCurrentDoctorAssignments(state: SnapshotState): boolean {
    const visitsByDoctor = new Map<string, StoredDoctorVisit[]>();

    for (const patientState of state.patients) {
      for (const visit of getDoctorVisits(patientState.agenda)) {
        if (
          visit.status !== 'with_staff' ||
          !visit.assignedDoctorUsername ||
          !state.doctors.some(
            (doctor) =>
              doctor.username === visit.assignedDoctorUsername &&
              !doctor.isTester,
          )
        ) {
          continue;
        }

        const current = visitsByDoctor.get(visit.assignedDoctorUsername) ?? [];
        current.push(visit);
        visitsByDoctor.set(visit.assignedDoctorUsername, current);
      }
    }

    let changed = false;

    for (const visits of visitsByDoctor.values()) {
      const [keptVisit, ...duplicateVisits] = [...visits].sort(
        (left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt),
      );
      void keptVisit;

      for (const visit of duplicateVisits) {
        visit.status = 'queued';
        visit.assignedDoctorUsername = null;
        changed = true;
      }
    }

    return changed;
  }

  private normalizeCurrentLabAssignments(state: SnapshotState): boolean {
    const itemsByTester = new Map<string, StoredLabItem[]>();

    for (const patientState of state.patients) {
      for (const batch of getLabBatches(patientState.agenda)) {
        for (const item of batch.items) {
          if (
            item.status !== 'with_staff' ||
            !item.assignedDoctorUsername ||
            !state.doctors.some(
              (doctor) =>
                doctor.username === item.assignedDoctorUsername &&
                doctor.isTester,
            )
          ) {
            continue;
          }

          const current = itemsByTester.get(item.assignedDoctorUsername) ?? [];
          current.push(item);
          itemsByTester.set(item.assignedDoctorUsername, current);
        }
      }
    }

    let changed = false;

    for (const items of itemsByTester.values()) {
      const [keptItem, ...duplicateItems] = [...items].sort(
        (left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt),
      );
      void keptItem;

      for (const item of duplicateItems) {
        item.status = 'queued';
        item.assignedDoctorUsername = null;
        changed = true;
      }
    }

    return changed;
  }

  private reindexDoctorQueueOrder(state: SnapshotState): boolean {
    const visitsBySpecialty = new Map<string, StoredDoctorVisit[]>();
    let changed = false;

    for (const patientState of state.patients) {
      for (const visit of getDoctorVisits(patientState.agenda)) {
        const isActionable =
          visit.status !== 'done' &&
          visit.status !== 'with_staff' &&
          !isVisitBlocked(patientState.agenda, visit);

        if (!isActionable) {
          if (visit.queueOrder !== 0) {
            visit.queueOrder = 0;
            changed = true;
          }
          continue;
        }

        const key = normalizeSpecialty(visit.specialty);
        const current = visitsBySpecialty.get(key) ?? [];
        current.push(visit);
        visitsBySpecialty.set(key, current);
      }
    }

    for (const visits of visitsBySpecialty.values()) {
      [...visits]
        .sort((left, right) =>
          compareByCodeAndTime(
            left.code,
            left.status,
            left.createdAt,
            left.id,
            right.code,
            right.status,
            right.createdAt,
            right.id,
          ),
        )
        .forEach((visit, index) => {
          if (visit.queueOrder !== index + 1) {
            visit.queueOrder = index + 1;
            changed = true;
          }
        });
    }

    return changed;
  }

  private reindexLabQueueOrder(state: SnapshotState): boolean {
    const itemsBySpecialty = new Map<string, StoredLabItem[]>();
    let changed = false;

    for (const patientState of state.patients) {
      for (const batch of getLabBatches(patientState.agenda)) {
        for (const item of batch.items) {
          const isActionable =
            batch.status === 'collecting' &&
            item.status !== 'with_staff' &&
            item.status !== 'taken' &&
            item.status !== 'results_ready';

          if (!isActionable) {
            if (item.queueOrder !== 0) {
              item.queueOrder = 0;
              changed = true;
            }
            continue;
          }

          const key = normalizeSpecialty(item.testerSpecialty);
          const current = itemsBySpecialty.get(key) ?? [];
          current.push(item);
          itemsBySpecialty.set(key, current);
        }
      }
    }

    for (const items of itemsBySpecialty.values()) {
      [...items]
        .sort((left, right) =>
          compareByCodeAndTime(
            left.code,
            left.status,
            left.createdAt,
            left.id,
            right.code,
            right.status,
            right.createdAt,
            right.id,
          ),
        )
        .forEach((item, index) => {
          if (item.queueOrder !== index + 1) {
            item.queueOrder = index + 1;
            changed = true;
          }
        });
    }

    return changed;
  }

  private findCurrentDoctorVisit(
    state: SnapshotState,
    username: string,
  ): StoredDoctorVisit | null {
    for (const patientState of state.patients) {
      const visit = getDoctorVisits(patientState.agenda).find(
        (candidate) =>
          candidate.status === 'with_staff' &&
          candidate.assignedDoctorUsername === username,
      );

      if (visit) {
        return visit;
      }
    }

    return null;
  }

  private findCurrentLabItem(
    state: SnapshotState,
    username: string,
  ): StoredLabItem | null {
    for (const patientState of state.patients) {
      for (const batch of getLabBatches(patientState.agenda)) {
        const item = batch.items.find(
          (candidate) =>
            candidate.status === 'with_staff' &&
            candidate.assignedDoctorUsername === username,
        );

        if (item) {
          return item;
        }
      }
    }

    return null;
  }

  private findNextDoctorVisitCandidate(
    state: SnapshotState,
    activeUser: AuthUser,
  ): { patientState: ActivePatientState; visit: StoredDoctorVisit } | null {
    if (state.offlineDoctorUsernames.has(activeUser.username)) {
      throw new ConflictException(
        'Mark yourself online before accepting the next patient.',
      );
    }

    const matches = state.patients.flatMap((patientState) =>
      getDoctorVisits(patientState.agenda)
        .filter(
          (visit) =>
            visit.status !== 'with_staff' &&
            visit.status !== 'done' &&
            (!visit.assignedDoctorUsername ||
              visit.assignedDoctorUsername === activeUser.username) &&
            !isVisitBlocked(patientState.agenda, visit) &&
            activeUser.specialties.some(
              (specialty) =>
                normalizeSpecialty(specialty) ===
                normalizeSpecialty(visit.specialty),
            ),
        )
        .map((visit) => ({ patientState, visit })),
    );

    return (
      matches.sort((left, right) =>
        compareByCodeAndTime(
          left.visit.code,
          left.visit.status,
          left.visit.createdAt,
          left.visit.id,
          right.visit.code,
          right.visit.status,
          right.visit.createdAt,
          right.visit.id,
        ),
      )[0] ?? null
    );
  }

  private findNextLabItemCandidate(
    state: SnapshotState,
    activeUser: AuthUser,
  ): {
    patientState: ActivePatientState;
    batch: StoredLabBatch;
    item: StoredLabItem;
  } | null {
    if (state.offlineDoctorUsernames.has(activeUser.username)) {
      throw new ConflictException(
        'Mark yourself online before accepting the next patient.',
      );
    }

    const matches = state.patients.flatMap((patientState) =>
      getLabBatches(patientState.agenda)
        .filter((batch) => batch.status === 'collecting')
        .flatMap((batch) =>
          batch.items
            .filter(
              (item) =>
                item.status !== 'with_staff' &&
                item.status !== 'taken' &&
                item.status !== 'results_ready' &&
                activeUser.specialties.some(
                  (specialty) =>
                    normalizeSpecialty(specialty) ===
                    normalizeSpecialty(item.testerSpecialty),
                ),
            )
            .map((item) => ({ patientState, batch, item })),
        ),
    );

    return (
      matches.sort((left, right) =>
        compareByCodeAndTime(
          left.item.code,
          left.item.status,
          left.item.createdAt,
          left.item.id,
          right.item.code,
          right.item.status,
          right.item.createdAt,
          right.item.id,
        ),
      )[0] ?? null
    );
  }

  private getActorLabel(
    activeUser: AuthUser,
    doctors: DoctorProfile[],
  ): string {
    if (activeUser.role === 'registry') {
      return 'Registry desk';
    }

    if (activeUser.role === 'nurse') {
      return 'Nurse station';
    }

    return (
      doctors.find((doctor) => doctor.username === activeUser.username)
        ?.displayName ?? activeUser.username
    );
  }

  private resolveSourceVisit(
    patientState: ActivePatientState,
    sourceVisitId: string | null,
    activeUser: AuthUser,
  ): StoredDoctorVisit | null {
    if (activeUser.role !== 'doctor' || activeUser.isTester) {
      return null;
    }

    if (sourceVisitId) {
      return (
        getDoctorVisits(patientState.agenda).find(
          (visit) => visit.id === sourceVisitId,
        ) ?? null
      );
    }

    return (
      getDoctorVisits(patientState.agenda).find(
        (visit) =>
          visit.assignedDoctorUsername === activeUser.username &&
          visit.status === 'with_staff',
      ) ??
      getDoctorVisits(patientState.agenda).find(
        (visit) =>
          visit.assignedDoctorUsername === activeUser.username &&
          visit.status !== 'done',
      ) ??
      null
    );
  }

  private buildGuidanceKey(patient: Patient | null): string | null {
    if (!patient) {
      return null;
    }

    const next = this.getNextActionableCandidate(patient);

    if (!next) {
      return null;
    }

    return `${next.id}:${next.title}:${next.code}:${next.status}`;
  }

  private buildGuidanceNotification(
    patient: Patient,
    candidate: AgendaCandidate,
  ): Pick<StoredPatientNotification, 'message' | 'title'> {
    if (candidate.status === 'not_here') {
      return {
        title: 'Patient not here',
        message: `${patient.name} is not here for ${candidate.title}. Please locate them and bring them back.`,
      };
    }

    if (candidate.status === 'with_staff') {
      return {
        title: 'Patient with staff',
        message: `${patient.name} is currently with ${candidate.title}.`,
      };
    }

    return {
      title: 'Guide patient',
      message: `${patient.name} should go next to ${candidate.title} with ${candidate.code.toLowerCase()} code.`,
    };
  }

  private buildDoctorVisitQueueTitle(
    visit: Pick<StoredDoctorVisit, 'isReturnVisit' | 'requestedByLabel' | 'specialty'>,
  ): string {
    if (!visit.isReturnVisit) {
      return visit.specialty;
    }

    if (normalizeWorkspaceValue(visit.requestedByLabel) === 'lab results') {
      return `Return to ${visit.specialty}`;
    }

    return `Return to ${visit.requestedByLabel}`;
  }

  private maybeCreateGuidanceNotification(
    notifications: StoredPatientNotification[],
    beforePatient: Patient | null,
    afterPatient: Patient,
    now: string,
  ): void {
    const beforeKey = this.buildGuidanceKey(beforePatient);
    const afterCandidate = this.getNextActionableCandidate(afterPatient);
    const afterKey = this.buildGuidanceKey(afterPatient);

    if (!afterCandidate || beforeKey === afterKey) {
      return;
    }

    const notification = this.buildGuidanceNotification(
      afterPatient,
      afterCandidate,
    );

    notifications.unshift({
      id: this.buildNotificationId(),
      targetRole: 'nurse',
      targetDoctorUsername: null,
      type: 'patient_guidance',
      title: notification.title,
      message: notification.message,
      createdAt: now,
      readAt: null,
      patientId: afterPatient.id,
      agendaEntryId: afterCandidate.id,
    });
  }

  private getNextActionableCandidate(patient: Patient): AgendaCandidate | null {
    const visitCandidates: AgendaCandidate[] = patient.agenda
      .filter(
        (
          entry,
        ): entry is Patient['agenda'][number] & { entryType: 'doctor_visit' } =>
          entry.entryType === 'doctor_visit',
      )
      .filter(
        (visit) =>
          visit.status !== 'done' &&
          !(
            visit.blockedByBatchId &&
            patient.agenda.some(
              (entry) =>
                entry.entryType === 'lab_batch' &&
                entry.id === visit.blockedByBatchId &&
                entry.status === 'collecting',
            )
          ),
      )
      .map((visit) => ({
        id: visit.id,
        title: this.buildDoctorVisitQueueTitle(visit),
        code: visit.code,
        status:
          visit.status === 'with_staff'
            ? ('with_staff' as const)
            : visit.status === 'not_here'
              ? ('not_here' as const)
              : ('queued' as const),
        createdAt: visit.createdAt,
      }));

    const labCandidates: AgendaCandidate[] = patient.agenda
      .filter(
        (
          entry,
        ): entry is Patient['agenda'][number] & { entryType: 'lab_batch' } =>
          entry.entryType === 'lab_batch' && entry.status === 'collecting',
      )
      .flatMap((batch) =>
        batch.items
          .filter(
            (item) =>
              item.status !== 'taken' && item.status !== 'results_ready',
          )
          .map((item) => ({
            id: item.id,
            title: item.testName,
            code: item.code,
            status:
              item.status === 'with_staff'
                ? ('with_staff' as const)
                : item.status === 'not_here'
                  ? ('not_here' as const)
                  : ('queued' as const),
            createdAt: item.createdAt,
          })),
      );

    const candidates: AgendaCandidate[] = [
      ...visitCandidates,
      ...labCandidates,
    ].sort((left, right) =>
      compareByCodeAndTime(
        left.code,
        left.status,
        left.createdAt,
        left.id,
        right.code,
        right.status,
        right.createdAt,
        right.id,
      ),
    );

    return candidates[0] ?? null;
  }

  private findPatientStateOrThrow(
    state: SnapshotState,
    patientId: string,
  ): ActivePatientState {
    const patientState = state.patients.find(
      (candidate) => candidate.core.id === patientId,
    );

    if (!patientState) {
      throw new NotFoundException('Patient details are unavailable right now.');
    }

    return patientState;
  }

  private findVisitByIdOrThrow(
    state: SnapshotState,
    visitId: string,
  ): { patientState: ActivePatientState; visit: StoredDoctorVisit } {
    for (const patientState of state.patients) {
      const visit = getDoctorVisits(patientState.agenda).find(
        (candidate) => candidate.id === visitId,
      );

      if (visit) {
        return { patientState, visit };
      }
    }

    throw new NotFoundException('Visit details are unavailable right now.');
  }

  private findLabItemByIdOrThrow(
    state: SnapshotState,
    itemId: string,
  ): {
    patientState: ActivePatientState;
    batch: StoredLabBatch;
    item: StoredLabItem;
  } {
    for (const patientState of state.patients) {
      for (const batch of getLabBatches(patientState.agenda)) {
        const item = batch.items.find((candidate) => candidate.id === itemId);

        if (item) {
          return { patientState, batch, item };
        }
      }
    }

    throw new NotFoundException('Lab item details are unavailable right now.');
  }

  private findLabBatchByIdOrThrow(
    state: SnapshotState,
    batchId: string,
  ): { patientState: ActivePatientState; batch: StoredLabBatch } {
    for (const patientState of state.patients) {
      const batch = getLabBatches(patientState.agenda).find(
        (candidate) => candidate.id === batchId,
      );

      if (batch) {
        return { patientState, batch };
      }
    }

    throw new NotFoundException('Lab batch details are unavailable right now.');
  }

  private getCatalogTestOrThrow(
    testName: string,
  ): CatalogOption & { testerSpecialty: string } {
    const match = LAB_TEST_CATALOG.find(
      (option) =>
        normalizeWorkspaceValue(option.label) ===
        normalizeWorkspaceValue(testName),
    );

    if (!match?.testerSpecialty) {
      throw new BadRequestException(`Unknown lab item: ${testName}.`);
    }

    return match as CatalogOption & { testerSpecialty: string };
  }

  private pushWorkspaceRefreshEvent(patientId: string): void {
    this.streamService.pushEvent({
      type: 'workspace:refresh',
      data: { id: patientId },
    });
  }

  private assertTester(activeUser: AuthUser): void {
    if (activeUser.role !== 'doctor' || !activeUser.isTester) {
      throw new ConflictException('Only tester users can perform this action.');
    }
  }

  private async persistPatientState(
    patientState: ActivePatientState,
  ): Promise<void> {
    await Promise.all([
      writeStoredPatientAgenda(
        this.redisService.client,
        patientState.core.id,
        patientState.agenda,
      ),
      writeStoredPatientNotifications(
        this.redisService.client,
        patientState.core.id,
        patientState.notifications,
      ),
    ]);
  }

  private async withQueueMutationLock<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const token = randomUUID();
    const result = await this.redisService.client.set(
      WORKSPACE_QUEUE_LOCK_KEY,
      token,
      {
        NX: true,
        PX: WORKSPACE_QUEUE_LOCK_TTL_MS,
      },
    );

    if (result !== 'OK') {
      throw new ConflictException('The shared queue is busy. Please try again.');
    }

    try {
      return await operation();
    } finally {
      await this.redisService.client.del(WORKSPACE_QUEUE_LOCK_KEY);
    }
  }

  private buildNotificationId(): string {
    return `NT-${randomUUID()}`;
  }

  private buildDoctorVisitId(): string {
    return `DV-${randomUUID()}`;
  }

  private buildLabBatchId(): string {
    return `LB-${randomUUID()}`;
  }

  private buildLabItemId(): string {
    return `LI-${randomUUID()}`;
  }
}
