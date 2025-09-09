const MASTER_PASSWORD = 'GradNext@2025'

export async function verifyPassword(password: string): Promise<boolean> {
  return password === MASTER_PASSWORD
}
