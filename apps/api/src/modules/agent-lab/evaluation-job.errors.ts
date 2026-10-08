export class EvaluationCancellationError extends Error {
  constructor() { super('EVALUATION_CANCELLED：已停止后续样本；已完成调用的费用仍保留。'); }
}
