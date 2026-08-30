const BULLET_RE = /^(\s*[-*•]|\s*\d+[.)])\s+/;

function isBulletLine(line: string): boolean {
  return BULLET_RE.test(line);
}

function isBlank(line: string): boolean {
  return !line.trim();
}

/**
 * Split a Gideon section into a short preview + remainder for "Show full answer".
 */
export function splitCompactAnswer(
  content: string,
  opts?: { maxBullets?: number; maxLeadChars?: number; minBulletsToCollapse?: number }
): {
  preview: string;
  rest: string | null;
  shouldCollapse: boolean;
} {
  const maxBullets = opts?.maxBullets ?? 3;
  const maxLeadChars = opts?.maxLeadChars ?? 280;
  const minBullets = opts?.minBulletsToCollapse ?? 4;
  const trimmed = content.replace(/\s+$/, "");
  if (!trimmed) {
    return { preview: "", rest: null, shouldCollapse: false };
  }

  const lines = trimmed.split(/\r?\n/);
  const bulletCount = lines.filter(isBulletLine).length;
  const shouldCollapse =
    bulletCount >= minBullets || trimmed.length > 520;

  if (!shouldCollapse) {
    return { preview: trimmed, rest: null, shouldCollapse: false };
  }

  const previewLines: string[] = [];
  let i = 0;

  // Lead: opening prose (non-bullet) up to maxLeadChars
  let leadChars = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      if (previewLines.length > 0) {
        previewLines.push(line);
        i += 1;
        break;
      }
      i += 1;
      continue;
    }
    if (isBulletLine(line)) break;
    if (leadChars + line.length > maxLeadChars && previewLines.length > 0) break;
    previewLines.push(line);
    leadChars += line.length;
    i += 1;
    if (leadChars >= maxLeadChars) break;
  }

  // Skip blanks before bullets
  while (i < lines.length && isBlank(lines[i]!)) {
    if (previewLines.length > 0 && previewLines[previewLines.length - 1] !== "") {
      previewLines.push("");
    }
    i += 1;
  }

  // First N bullets (+ simple continuation lines that aren't new bullets)
  let bullets = 0;
  while (i < lines.length && bullets < maxBullets) {
    const line = lines[i]!;
    if (isBlank(line)) {
      previewLines.push(line);
      i += 1;
      continue;
    }
    if (!isBulletLine(line)) {
      // Stop at next prose block / heading
      if (/^#{1,4}\s+/.test(line.trim()) || bullets > 0) break;
      previewLines.push(line);
      i += 1;
      continue;
    }
    previewLines.push(line);
    bullets += 1;
    i += 1;
    while (i < lines.length) {
      const cont = lines[i]!;
      if (isBlank(cont) || isBulletLine(cont) || /^#{1,4}\s+/.test(cont.trim())) {
        break;
      }
      // Indented / wrapped continuation of the bullet
      if (/^\s{2,}/.test(cont) || cont.length < 80) {
        previewLines.push(cont);
        i += 1;
      } else {
        break;
      }
    }
  }

  const restLines = lines.slice(i);
  while (restLines.length && isBlank(restLines[0]!)) restLines.shift();

  const preview = previewLines.join("\n").replace(/\s+$/, "");
  const rest = restLines.length ? restLines.join("\n").replace(/\s+$/, "") : null;

  if (!rest || rest === preview) {
    return { preview: trimmed, rest: null, shouldCollapse: false };
  }

  return { preview, rest, shouldCollapse: true };
}
