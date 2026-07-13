import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt =
  "Guardian by NM2TECH — your private vault for the documents that matter";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  const logoBytes = await readFile(
    join(process.cwd(), "public", "nm2tech-logo.png")
  );
  const logoSrc = `data:image/png;base64,${Buffer.from(logoBytes).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
          padding: "40px 72px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={320}
          height={230}
          alt=""
          style={{
            objectFit: "contain",
          }}
        />
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            Guardian
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 30,
              fontWeight: 500,
              color: "#f5f5f4",
              textAlign: "center",
              lineHeight: 1.3,
              maxWidth: 920,
            }}
          >
            Your private vault for the documents that matter
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
