import type { UserRole } from '../../../src/auth/auth.constants';

export interface SeedUserDefinition {
  username: string;
  password: string;
  role: UserRole;
  isTester?: boolean;
  specialties?: string[];
}

export const registryUsers: SeedUserDefinition[] = [
  {
    username: 'registry.admissions',
    password: 'RegistryDemo!24',
    role: 'registry',
  },
  {
    username: 'registry.frontdesk',
    password: 'RegistryDesk!24',
    role: 'registry',
  },
  {
    username: 'registry.night',
    password: 'RegistryNight!24',
    role: 'registry',
  },
];

export const nurses: SeedUserDefinition[] = [
  {
    username: 'nurse.elena',
    password: 'NurseWard!24',
    role: 'nurse',
  },
  {
    username: 'nurse.martin',
    password: 'NurseShift!24',
    role: 'nurse',
  },
  {
    username: 'nurse.petya',
    password: 'NursePulse!24',
    role: 'nurse',
  },
  {
    username: 'nurse.ivan',
    password: 'NurseCare!24',
    role: 'nurse',
  },
];

export const doctors: SeedUserDefinition[] = [
  {
    username: 'doctor.nikola',
    password: 'DoctorICU!24',
    role: 'doctor',
    specialties: ['icu', 'pulmonology'],
  },
  {
    username: 'doctor.petrova',
    password: 'DoctorCardio!24',
    role: 'doctor',
    specialties: ['cardiology'],
  },
  {
    username: 'doctor.dimitrov',
    password: 'DoctorNeuro!24',
    role: 'doctor',
    specialties: ['neurology'],
  },
  {
    username: 'doctor.rahman',
    password: 'DoctorIM!24',
    role: 'doctor',
    specialties: ['internal-medicine', 'infectious-disease'],
  },
  {
    username: 'doctor.ilieva',
    password: 'DoctorOrtho!24',
    role: 'doctor',
    specialties: ['orthopedics', 'trauma'],
  },
  {
    username: 'doctor.todorov',
    password: 'DoctorPeds!24',
    role: 'doctor',
    specialties: ['pediatrics', 'emergency'],
  },
];

export const testerDoctors: SeedUserDefinition[] = [
  {
    username: 'tester.lab',
    password: 'TesterLab!24',
    role: 'doctor',
    isTester: true,
    specialties: ['blood-test', 'urinalysis'],
  },
  {
    username: 'tester.scan',
    password: 'TesterScan!24',
    role: 'doctor',
    isTester: true,
    specialties: ['imaging', 'ct-scan', 'x-ray'],
  },
  {
    username: 'tester.echo',
    password: 'TesterEcho!24',
    role: 'doctor',
    isTester: true,
    specialties: ['ultrasound', 'echocardiogram'],
  },
];

export const adminUsers: SeedUserDefinition[] = [
  {
    username: 'admin.ops',
    password: 'AdminOps!24',
    role: 'admin',
  },
];

export const allSeedUsers: SeedUserDefinition[] = [
  ...registryUsers,
  ...nurses,
  ...doctors,
  ...testerDoctors,
  ...adminUsers,
];
