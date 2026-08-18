import "server-only";

import type { VisionProvider } from "./types";
import { createAnthropicVisionProvider } from "./anthropicProvider";

let cached: VisionProvider | null = null;

/** Provider abstraction so Guardian can swap vision models later. */
export function getVisionProvider(): VisionProvider {
  if (cached) return cached;
  cached = createAnthropicVisionProvider();
  return cached;
}

export function __setVisionProviderForTests(provider: VisionProvider | null): void {
  cached = provider;
}
