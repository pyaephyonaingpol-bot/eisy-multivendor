/** Allowlisted signup email that receives admin via DB trigger (not client metadata). */
export const BOOTSTRAP_ADMIN_EMAIL = "pyaephyonaing.pol@gmail.com";

export function isBootstrapAdminEmail(email: string) {
  return email.trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
}
