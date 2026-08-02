import type { ActionContext, ActionDefinition } from "./types";

const registry = new Map<string, ActionDefinition>();

export function registerAction(action: ActionDefinition): void {
  registry.set(action.id, action);
}

export function getAction(id: string): ActionDefinition | undefined {
  return registry.get(id);
}

export function getAllActions(): ActionDefinition[] {
  return [...registry.values()];
}

export function getMatchingActions(ctx: ActionContext): ActionDefinition[] {
  return getAllActions().filter((action) =>
    action.matches(ctx.question, ctx)
  );
}

export function clearActionsForTests(): void {
  registry.clear();
}
