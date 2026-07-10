export interface CandidateQuestionRef {
  id: string;
}

export function selectCandidateQuestions<T extends CandidateQuestionRef>(
  questions: T[],
  accessCode: string,
  moduleId: string,
  limit = 2,
): T[] {
  if (limit <= 0) return [];
  if (questions.length <= limit) return questions;
  const seed = Array.from(`${accessCode}:${moduleId}`).reduce((total, character) => total + character.charCodeAt(0), 0);
  const start = seed % questions.length;
  return Array.from({ length: limit }, (_, index) => questions[(start + index) % questions.length]);
}
