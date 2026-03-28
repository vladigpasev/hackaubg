import type { AuthUser } from '../../../auth/types'
import type { CatalogOption, DoctorProfile } from '../types/patient'

const baseClinicians: DoctorProfile[] = [
  {
    displayName: 'Dr. Nikola',
    id: 'DOC-doctor-nikola',
    isTester: false,
    specialties: ['ICU', 'Pulmonology'],
    username: 'doctor.nikola',
  },
  {
    displayName: 'Dr. Petrova',
    id: 'DOC-doctor-petrova',
    isTester: false,
    specialties: ['Cardiology'],
    username: 'doctor.petrova',
  },
  {
    displayName: 'Lab Tester',
    id: 'DOC-tester-lab',
    isTester: true,
    specialties: ['Laboratory Medicine', 'Blood Test'],
    username: 'tester.lab',
  },
  {
    displayName: 'Imaging Tester',
    id: 'DOC-tester-scan',
    isTester: true,
    specialties: ['Radiology', 'Imaging', 'Scanner'],
    username: 'tester.scan',
  },
]

const specialtyCatalogSeed: CatalogOption[] = [
  { id: 'sp-cardiology', keywords: ['cardio', 'heart'], label: 'Cardiology' },
  { id: 'sp-icu', keywords: ['icu', 'critical care'], label: 'ICU' },
  { id: 'sp-pulmonology', keywords: ['lungs', 'breathing'], label: 'Pulmonology' },
  { id: 'sp-radiology', keywords: ['radiology', 'imaging', 'scanner'], label: 'Radiology' },
  { id: 'sp-lab', keywords: ['lab', 'blood', 'analysis'], label: 'Laboratory Medicine' },
]

const testCatalogSeed: CatalogOption[] = [
  {
    id: 'test-blood',
    keywords: ['bloodwork', 'cbc', 'blood'],
    label: 'Blood Test',
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-ecg',
    keywords: ['ecg', 'ekg', 'heart'],
    label: 'ECG',
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-urine',
    keywords: ['urine', 'sample'],
    label: 'Urine Test',
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-xray',
    keywords: ['xray', 'x-ray', 'lungs'],
    label: 'Chest X-Ray',
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-ct',
    keywords: ['ct', 'scan'],
    label: 'CT Scan',
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-mri',
    keywords: ['mri', 'scan'],
    label: 'MRI',
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-ultrasound',
    keywords: ['ultrasound', 'echo'],
    label: 'Ultrasound',
    testerSpecialty: 'Radiology',
  },
]

function normalizeValue(value: string) {
  return value.trim().toLowerCase()
}

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1).toLowerCase()}`)
    .join(' ')
}

function buildRuntimeDoctorProfile(user: AuthUser): DoctorProfile {
  const derivedSpecialties =
    user.specialties.length > 0
      ? user.specialties.map(titleCase)
      : [user.isTester ? 'Laboratory Medicine' : 'ICU']

  return {
    displayName: user.username.startsWith('doctor.') ? `Dr. ${titleCase(user.username.slice(7))}` : titleCase(user.username),
    id: `DOC-${normalizeValue(user.username).replace(/[^a-z0-9]+/g, '-')}`,
    isTester: user.isTester,
    specialties: derivedSpecialties,
    username: user.username,
  }
}

export function buildClinicianDirectory(activeUser: AuthUser | null): DoctorProfile[] {
  const clinicians = baseClinicians.map((doctor) => ({
    ...doctor,
    specialties: [...doctor.specialties],
  }))

  if (activeUser?.role !== 'doctor') {
    return clinicians
  }

  if (clinicians.some((doctor) => doctor.username === activeUser.username)) {
    return clinicians
  }

  clinicians.push(buildRuntimeDoctorProfile(activeUser))
  return clinicians
}

export function buildSpecialtyCatalog(doctors: DoctorProfile[]) {
  const mergedCatalog = specialtyCatalogSeed.map((option) => ({
    ...option,
    keywords: [...option.keywords],
  }))
  const seenSpecialties = new Set(mergedCatalog.map((option) => normalizeValue(option.label)))

  doctors.forEach((doctor) => {
    doctor.specialties.forEach((specialty) => {
      const normalizedSpecialty = normalizeValue(specialty)

      if (seenSpecialties.has(normalizedSpecialty)) {
        return
      }

      seenSpecialties.add(normalizedSpecialty)
      mergedCatalog.push({
        id: `sp-runtime-${normalizedSpecialty.replace(/[^a-z0-9]+/g, '-')}`,
        keywords: [],
        label: specialty,
      })
    })
  })

  return mergedCatalog
}

export function getTestCatalog() {
  return testCatalogSeed.map((option) => ({
    ...option,
    keywords: [...option.keywords],
  }))
}

export function normalizeSpecialty(value: string) {
  const normalizedValue = normalizeValue(value)

  if (normalizedValue === 'blood-test' || normalizedValue === 'blood test' || normalizedValue === 'lab') {
    return 'laboratory medicine'
  }

  if (normalizedValue === 'scanner' || normalizedValue === 'imaging') {
    return 'radiology'
  }

  return normalizedValue
}
