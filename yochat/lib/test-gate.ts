/**
 * Wave 9 (item 9a) — hard gate for test-only admin actions
 * (simulate_stuck_job, simulate_failed_job, force_wait_timeout, and the other
 * probe/simulation actions in the admin action route).
 *
 * These actions corrupt real delivery state, so they must be UNREACHABLE in
 * production. The gate is a single env check: enabled everywhere EXCEPT
 * NODE_ENV=production. This module is deliberately dependency-free (no `@/`
 * aliases) so the production-mode branch can be unit-tested by importing it
 * in a plain node child process with NODE_ENV=production — see the Wave 9
 * smoke checks.
 */
export function isTestActionsEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
