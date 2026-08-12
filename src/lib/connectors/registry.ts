import type { GuardianConnector } from "./types";

const connectors = new Map<string, GuardianConnector>();

export const connectorRegistry = {
  register(type: string, connector: GuardianConnector): void {
    connectors.set(type, connector);
  },

  get(type: string): GuardianConnector | undefined {
    return connectors.get(type);
  },

  has(type: string): boolean {
    return connectors.has(type);
  },

  list(): string[] {
    return [...connectors.keys()];
  },
};

let registered = false;

/** Idempotent registration of built-in connectors (client-safe). */
export function ensureConnectorsRegistered(): void {
  if (registered) return;
  registered = true;

  // Lazy require to avoid pulling browser APIs into server bundles accidentally.
  // Registration is called from client UI entry points.
  void import("./android/AndroidStorageConnector").then(
    ({ AndroidStorageConnector }) => {
      connectorRegistry.register(
        "android_storage",
        new AndroidStorageConnector()
      );
    }
  );
}

export function registerAndroidStorageConnectorSync(
  connector: GuardianConnector
): void {
  connectorRegistry.register("android_storage", connector);
  registered = true;
}
