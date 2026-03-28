export const ROLE_HOME_PATHS = {
  registry: '/registry',
  nurse: '/nurse',
  doctor: '/doctor',
  admin: '/admin',
} as const

export type UserRole = keyof typeof ROLE_HOME_PATHS

export function getRoleHomePath(role: UserRole) {
  return ROLE_HOME_PATHS[role]
}

export function isRolePathAllowed(role: UserRole, pathname: string) {
  return pathname === getRoleHomePath(role)
}

export function formatRoleLabel(role: UserRole) {
  switch (role) {
    case 'registry':
      return 'Registry'
    case 'nurse':
      return 'Nurse'
    case 'doctor':
      return 'Doctor'
    case 'admin':
      return 'Admin'
  }
}
