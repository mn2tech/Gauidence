/**
 * Guardian knowledge is a Gideon tool, not the default path.
 *
 * OLD: Question → search documents → LLM → answer
 * NEW: Question → intent router → choose capability → maybe searchGuardianKnowledge
 *
 * Implementation reuses loadWorkspaceContext (hybrid retrieval, ontology, logs)
 * with the authenticated Supabase client so RLS, space membership, owner/editor/
 * viewer rules, client visibility, and organization boundaries still apply.
 * Routing must never widen access.
 */

export { shouldSearchGuardianKnowledge } from "../intent";
export type { GideonRoute } from "../intent";

export type SearchGuardianKnowledgeInput = {
  query: string;
  spaceId?: string;
  filters?: { profileIds?: string[] };
};
