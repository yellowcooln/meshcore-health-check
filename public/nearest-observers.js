// No geolocation, storage or network access: ranking is local to the browser.
function validCoordinates(point) {
  return typeof point?.lat === 'number' && Number.isFinite(point.lat)
    && typeof point?.lon === 'number' && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

function distanceKm(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(to.lat - from.lat);
  const dLon = radians(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function nearestObservers({ observers, origin, radiusKm, windowSeconds, now = Date.now() }) {
  if (!validCoordinates(origin) || !Number.isFinite(radiusKm) || radiusKm < 0
    || !Number.isFinite(windowSeconds) || windowSeconds <= 0 || !Number.isFinite(now)) {
    return [];
  }
  const ranked = (Array.isArray(observers) ? observers : [])
    .filter((observer) => /^[0-9a-f]{64}$/i.test(observer?.key || '')
      && validCoordinates(observer) && !(observer.lat === 0 && observer.lon === 0)
      // A retained profile is not evidence of activity. Recheck time at click,
      // so an old/disconnected bootstrap cannot keep observers active forever.
      && observer.isActive === true && Number.isFinite(observer.lastPacketAt)
      && observer.lastPacketAt > 0 && observer.lastPacketAt <= now
      && now - observer.lastPacketAt <= windowSeconds * 1000)
    .map((observer) => ({ ...observer, distanceKm: distanceKm(origin, observer) }))
    .filter((observer) => observer.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm
      || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const seen = new Set();
  return ranked.filter((observer) => {
    if (seen.has(observer.key)) return false;
    seen.add(observer.key);
    return true;
  }).slice(0, 10);
}
