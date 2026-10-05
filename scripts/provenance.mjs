// Where did a session's biometric readings come from?
//
// `device_id` is set only when the serial bridge registers a device. The
// current bridge always does (it defaults --device-label), but board sessions
// recorded with an older copy of the bridge (2026-07-26 to 08-01) carry no tag —
// so "no device_id" does NOT mean "simulated". Found 2026-10-04: four untagged
// sessions (1,348 readings) have the optical sensor's signature, not the
// simulator's.
//
// The simulator (hardware/simulate.js) and the Fig. 3 generator emit smooth,
// in-range heart rates and never drop a reading. A real optical sensor, worn on
// a moving hand, does all three of: drops out (null heart rate), misreads
// outside 40–180 bpm, and jumps >20 bpm between readings. Any one of those, in an
// untagged session, marks it as board data.
//
// Since 2026-10-05 the simulator and the Fig. 3 generator register as the
// device labelled 'simulator', so their rows are tagged too. Pass that
// device's id(s) as `simulatorDeviceIds`; without it a tagged simulator run
// would read as board data.
export const SIMULATOR_LABEL = 'simulator'

export function biometricProvenance(rows, simulatorDeviceIds = new Set()) {
  if (!rows?.length) return 'none'
  if (rows.some((r) => r.device_id && simulatorDeviceIds.has(r.device_id))) return 'simulator-tagged'
  if (rows.some((r) => r.device_id)) return 'board-tagged'
  const hr = rows.map((r) => r.heart_rate)
  const dropout = hr.some((h) => h === null)
  const implausible = hr.some((h) => h !== null && (h < 40 || h > 180))
  let jump = false
  for (let i = 1; i < hr.length && !jump; i++) {
    if (hr[i] !== null && hr[i - 1] !== null && Math.abs(hr[i] - hr[i - 1]) > 20) jump = true
  }
  return dropout || implausible || jump ? 'board-untagged' : 'simulator'
}
