import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAppleMapsDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  formatProfileAddress,
  prefersAppleMaps,
} from "../directions.ts";

test("formatProfileAddress prefers location_address", () => {
  assert.equal(
    formatProfileAddress({
      location_address: " 123 Main St ",
      description: "notes",
      profile_type: "client",
    }),
    "123 Main St"
  );
});

test("formatProfileAddress falls back to home description", () => {
  assert.equal(
    formatProfileAddress({
      description: "456 Oak Ave",
      profile_type: "home",
    }),
    "456 Oak Ave"
  );
});

test("formatProfileAddress ignores client description notes", () => {
  assert.equal(
    formatProfileAddress({
      description: "Retainer client",
      profile_type: "client",
    }),
    null
  );
});

test("buildGoogleMapsDirectionsUrl encodes destination and origin", () => {
  const url = buildGoogleMapsDirectionsUrl({
    destination: "123 Main St, Austin, TX",
    origin: { lat: 30.27, lng: -97.74 },
  });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(url, /travelmode=driving/);
  assert.match(url, /origin=30\.27%2C-97\.74/);
  assert.match(url, /destination=123\+Main\+St/);
});

test("buildAppleMapsDirectionsUrl includes saddr and daddr", () => {
  const url = buildAppleMapsDirectionsUrl({
    destination: "HQ",
    origin: { lat: 1, lng: 2 },
  });
  assert.match(url, /^https:\/\/maps\.apple\.com\/\?/);
  assert.match(url, /daddr=HQ/);
  assert.match(url, /saddr=1%2C2/);
  assert.match(url, /dirflg=d/);
});

test("prefersAppleMaps on iPhone user agent", () => {
  assert.equal(
    prefersAppleMaps(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    ),
    true
  );
  assert.equal(prefersAppleMaps("Mozilla/5.0 (Windows NT 10.0)"), false);
});
