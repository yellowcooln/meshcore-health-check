// Opt-in only. Retain the best fix in memory for at most 12 seconds.
export function refineLocation({ geolocation, complete, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let best = null;
  let done = false;
  let watch;
  let timer;
  const cleanup = () => {
    if (watch !== undefined) { geolocation.clearWatch(watch); watch = undefined; }
    if (timer !== undefined) { clearTimer(timer); timer = undefined; }
  };
  const finish = (error = { code: 3 }) => {
    if (done) return;
    done = true;
    cleanup();
    const fix = best;
    best = null;
    complete({ fix, approximate: !fix || fix.accuracy > 1000, error: fix ? null : error });
  };
  timer = setTimer(() => finish(), 12000);
  try {
    watch = geolocation.watchPosition((position) => {
      if (done) return;
      const { latitude: lat, longitude: lon, accuracy } = position?.coords || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      const reportedAccuracy = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : Infinity;
      if (!best || reportedAccuracy < best.accuracy) best = { lat, lon, accuracy: reportedAccuracy };
      if (best.accuracy <= 1000) finish();
    }, finish, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    // Test doubles and some wrappers may invoke a callback synchronously.
    if (done) cleanup();
  } catch (error) { finish(error); }
  return () => { done = true; best = null; cleanup(); };
}
