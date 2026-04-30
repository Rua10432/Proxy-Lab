export const state = {
  isRunning: false,
  isScanRunning: false,
  isMtrRunning: false,
  stats: resetStats()
};

export function resetStats() {
  return { min: null, max: null, sum: 0n, ok: 0, fail: 0 };
}
