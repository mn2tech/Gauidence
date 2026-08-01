/** Which chat LLM providers are configured (server env only). */

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

/** True when Ask Gideon / chat routes can run (Claude and/or DeepSeek). */
export function isChatLlmConfigured(): boolean {
  return isAnthropicConfigured() || isDeepSeekConfigured();
}
