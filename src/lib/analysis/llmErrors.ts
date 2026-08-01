export class AnalysisLlmError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 502, code = "llm_error") {
    super(message);
    this.name = "AnalysisLlmError";
    this.status = status;
    this.code = code;
  }
}
