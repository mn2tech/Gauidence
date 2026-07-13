const sharp = require("sharp");
const path = require("path");

async function main() {
  const logoPath = path.join("public", "nm2tech-logo.png");

  // Landscape — logo fills left so WhatsApp left-crop still shows the brand
  const logo = await sharp(logoPath)
    .resize(540, 540, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer();

  const textSvg = Buffer.from(`
<svg width="560" height="630" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="250" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="86" font-weight="700" fill="#ffffff">Guardian</text>
  <text x="0" y="320" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="500" fill="#fafaf9">Your private vault for the</text>
  <text x="0" y="360" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="500" fill="#fafaf9">documents that matter.</text>
</svg>`);

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: logo, left: 45, top: 45 },
      { input: textSvg, left: 620, top: 0 },
    ])
    .png()
    .toFile(path.join("public", "guardian-og.png"));

  // Square — primary for WhatsApp / iMessage thumbnails
  const squareLogo = await sharp(logoPath)
    .resize(620, 620, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer();

  const squareText = Buffer.from(`
<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <text x="540" y="820" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="110" font-weight="700" fill="#ffffff">Guardian</text>
  <text x="540" y="900" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="500" fill="#fafaf9">Your private document vault</text>
</svg>`);

  await sharp({
    create: {
      width: 1080,
      height: 1080,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: squareLogo, left: 230, top: 80 },
      { input: squareText, left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join("public", "guardian-og-square.png"));

  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
