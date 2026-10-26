/** Runs once when the Node server starts: loads the simulated clock and starts automatic alert checks. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadClock } = await import("./lib/clock");
  await loadClock();
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
