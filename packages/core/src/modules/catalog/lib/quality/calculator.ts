import type { ConfiguredRuleBinding, Grade, RuleResult } from './types'

export function calculateScore(
  bindings: ConfiguredRuleBinding[],
  results: Record<string, RuleResult>
): { score: number; grade: Grade } {
  const lowMed = bindings.filter((b) => b.severity === 'LOW' || b.severity === 'MEDIUM')
  const totalWeight = lowMed.reduce((s, b) => s + b.weight, 0)
  const passedWeight = lowMed
    .filter((b) => results[b.bindingKey]?.passed)
    .reduce((s, b) => s + b.weight, 0)

  let score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100

  const failed = bindings.filter((b) => !results[b.bindingKey]?.passed)

  if (failed.some((b) => b.severity === 'BLOCKER')) {
    score = 0
  } else {
    const failedHigh = failed.filter((b) => b.severity === 'HIGH')
    if (failedHigh.length > 0) {
      score = Math.min(score, Math.min(...failedHigh.map((b) => b.highSeverityCap)))
    }
  }

  const grade: Grade =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'

  return { score, grade }
}
