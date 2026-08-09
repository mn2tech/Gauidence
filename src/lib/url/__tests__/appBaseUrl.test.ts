import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("getAppBaseUrl", () => {
  const original = { ...process.env };

  it("prefers NEXT_PUBLIC_APP_URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
    const { getAppBaseUrl } = await import("../appBaseUrl.ts");
    assert.equal(getAppBaseUrl(), "https://app.example.com");
    process.env = { ...original };
  });

  it("uses request host when env is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
    const { getAppBaseUrl } = await import("../appBaseUrl.ts");
    const request = new Request("https://ignored", {
      headers: {
        host: "preview.example.com",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(getAppBaseUrl({ request }), "https://preview.example.com");
    process.env = { ...original };
  });
});
