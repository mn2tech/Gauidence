export type GeoPoint = { lat: number; lng: number };

export function formatProfileAddress(profile: {
  location_address?: string | null;
  description?: string | null;
  profile_type?: string;
}): string | null {
  const explicit = profile.location_address?.trim();
  if (explicit) return explicit;
  if (profile.profile_type === "home") {
    const legacy = profile.description?.trim();
    if (legacy && legacy.length >= 5) return legacy;
  }
  return null;
}

export function buildGoogleMapsDirectionsUrl(args: {
  destination: string;
  origin?: GeoPoint | string;
}): string {
  const params = new URLSearchParams({
    api: "1",
    destination: args.destination,
    travelmode: "driving",
  });
  if (args.origin) {
    const origin =
      typeof args.origin === "string"
        ? args.origin
        : `${args.origin.lat},${args.origin.lng}`;
    params.set("origin", origin);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildAppleMapsDirectionsUrl(args: {
  destination: string;
  origin?: GeoPoint;
}): string {
  const params = new URLSearchParams({
    daddr: args.destination,
    dirflg: "d",
  });
  if (args.origin) {
    params.set("saddr", `${args.origin.lat},${args.origin.lng}`);
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

export function prefersAppleMaps(userAgent: string): boolean {
  return /iPad|iPhone|iPod|Macintosh/.test(userAgent);
}

export function getCurrentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              "Allow location access to open driving directions from where you are."
            )
          );
          return;
        }
        reject(new Error("Could not determine your location. Try again."));
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
    );
  });
}

export async function openDrivingDirections(destination: string): Promise<void> {
  const trimmed = destination.trim();
  if (!trimmed) {
    throw new Error("Add an address before opening directions.");
  }

  let origin: GeoPoint | undefined;
  try {
    origin = await getCurrentPosition();
  } catch {
    /* Maps apps can use device location when opened without an origin. */
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const url = prefersAppleMaps(ua)
    ? buildAppleMapsDirectionsUrl({ destination: trimmed, origin })
    : buildGoogleMapsDirectionsUrl({ destination: trimmed, origin });

  window.open(url, "_blank", "noopener,noreferrer");
}
