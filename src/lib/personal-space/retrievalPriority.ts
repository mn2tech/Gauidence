import type { RetrievalSourceLayer } from "./types";

/**
 * Gideon retrieval priority for Personal Space:
 * 1. Structured personal knowledge
 * 2. Personal Space documents/chunks
 * 3. Other authorized Spaces
 * 4. General model knowledge
 * 5. Web (only when explicitly required)
 */
export const RETRIEVAL_PRIORITY: RetrievalSourceLayer[] = [
  "structured_knowledge",
  "documents",
  "other_spaces",
  "general_model",
  "web",
];

export function personalRetrievalSystemNote(): string {
  return `PERSONAL SPACE RETRIEVAL PRIORITY (strict):
1) Prefer STRUCTURED KNOWLEDGE and ONTOLOGY facts about this user.
2) Then Personal Space document excerpts.
3) Then other authorized Spaces the user can access — never unauthorized Spaces.
4) Use general model knowledge only when Guardian knowledge does not contain the answer, or the question is clearly general (e.g. "What is a passport?").
5) Do not invent personal facts (passport numbers, plate numbers, birthdays, etc.). If unknown, say you don't have it in Guardian yet.
6) When an answer comes from a document, name the source file so the UI can offer View Source.
7) Answer only at the requested depth — do not over-answer.`;
}

export function isPersonalFactQuestion(question: string): boolean {
  return /\b(my|i have|i own|do i|when is my|who is my|what car|passport|registration|accountant|appointment)\b/i.test(
    question
  );
}

export function isGeneralKnowledgeQuestion(question: string): boolean {
  return /^what is (a|an)\b/i.test(question.trim());
}
