import { SKILL_TERMS, SKILL_TAXONOMY_VERSION } from './job-skill-terms';

export const QUESTION_SKILL_MAPPING_VERSION = 'question-job-lexical/v1';

export function mapQuestionToJobSkill(question: string, requirements: Array<{
  skillId: string;
  skill: { slug: string; taxonomyVersion: string; isActive: boolean };
}>) {
  const normalized = question.toLowerCase();
  const matched = requirements.flatMap(requirement => {
    if (!requirement.skill.isActive || requirement.skill.taxonomyVersion !== SKILL_TAXONOMY_VERSION) return [];
    const terms = SKILL_TERMS.find(entry => entry.slug === requirement.skill.slug)?.terms || [];
    const matchedTerms = terms.filter(term => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Latin terms need word boundaries: React is not evidence about reactive.
      return /[a-z]/i.test(term)
        ? new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`, 'i').test(normalized)
        : normalized.includes(term);
    });
    return matchedTerms.length ? [{ skillId: requirement.skillId, matchedTerms }] : [];
  });
  const candidateSkillIds = [...new Set(matched.map(item => item.skillId))].sort();
  return {
    skillId: candidateSkillIds.length === 1 ? candidateSkillIds[0] : null,
    metadata: {
      version: QUESTION_SKILL_MAPPING_VERSION,
      reason: candidateSkillIds.length === 1 ? 'unique-match' : candidateSkillIds.length ? 'ambiguous' : 'no-match',
      candidateSkillIds,
      matchedTerms: [...new Set(matched.flatMap(item => item.matchedTerms))].sort(),
    },
  };
}
