import { calculateScore } from '../calculator'
import type { ConfiguredRuleBinding, RuleResult } from '../types'

function binding(
  ruleId: string,
  severity: ConfiguredRuleBinding['severity'],
  weight = 1.0,
  highSeverityCap = 40,
): ConfiguredRuleBinding {
  return { ruleId, params: {}, weight, severity, highSeverityCap }
}

/**
 * TC-001: Product missing title → BLOCKER rule fails → score = 0, grade = F
 */
describe('TC-001: BLOCKER rule forces score to 0', () => {
  it('returns score=0 and grade=F when any BLOCKER binding fails', () => {
    const bindings = [
      binding('attr.required:title', 'BLOCKER'),
      binding('attr.required:description', 'HIGH'),
      binding('media.min_count', 'MEDIUM'),
    ]
    const results: Record<string, RuleResult> = {
      'attr.required:title': { passed: false, message: 'Field "title" is required.' },
      'attr.required:description': { passed: true },
      'media.min_count': { passed: true },
    }
    const { score, grade } = calculateScore(bindings, results)
    expect(score).toBe(0)
    expect(grade).toBe('F')
  })
})

/**
 * TC-002: Product missing description → HIGH rule fails, cap=40 → score ≤ 40, grade D or F
 */
describe('TC-002: HIGH rule failure caps score', () => {
  it('caps score at highSeverityCap when HIGH binding fails', () => {
    const bindings = [
      binding('attr.required:description', 'HIGH', 1.0, 40),
      binding('media.min_count', 'MEDIUM', 1.0),
      binding('attr.required:sku', 'MEDIUM', 1.0),
    ]
    const results: Record<string, RuleResult> = {
      'attr.required:description': { passed: false, message: 'description required' },
      'media.min_count': { passed: true },
      'attr.required:sku': { passed: true },
    }
    const { score, grade } = calculateScore(bindings, results)
    expect(score).toBeLessThanOrEqual(40)
    expect(['D', 'F']).toContain(grade)
  })

  it('takes minimum highSeverityCap when multiple HIGH bindings fail', () => {
    const bindings = [
      binding('rule.a', 'HIGH', 1.0, 60),
      binding('rule.b', 'HIGH', 1.0, 30),
    ]
    const results: Record<string, RuleResult> = {
      'rule.a': { passed: false },
      'rule.b': { passed: false },
    }
    const { score } = calculateScore(bindings, results)
    expect(score).toBe(30)
  })
})

/**
 * TC-003: All default fields present → all rules pass → score = 100, grade = A
 */
describe('TC-003: All rules pass → full score', () => {
  it('returns score=100 and grade=A when all bindings pass', () => {
    const bindings = [
      binding('attr.required:title', 'BLOCKER'),
      binding('attr.required:description', 'HIGH', 1.0, 40),
      binding('attr.required:defaultMediaId', 'HIGH', 1.0, 40),
      binding('attr.required:sku', 'MEDIUM'),
      binding('media.min_count', 'MEDIUM', 0.5),
      binding('attr.required:subtitle', 'LOW', 0.5),
    ]
    const results: Record<string, RuleResult> = Object.fromEntries(
      bindings.map((b) => [b.ruleId, { passed: true }]),
    )
    const { score, grade } = calculateScore(bindings, results)
    expect(score).toBe(100)
    expect(grade).toBe('A')
  })
})

/**
 * TC-005: All bindings are LOW/MEDIUM with totalWeight = 0 → score = 100 (edge case)
 */
describe('TC-005: Empty bindings edge case', () => {
  it('returns score=100 when there are no LOW/MEDIUM bindings (totalWeight=0)', () => {
    const bindings = [
      binding('info.rule', 'INFO'),
    ]
    const results: Record<string, RuleResult> = {
      'info.rule': { passed: false },
    }
    const { score, grade } = calculateScore(bindings, results)
    expect(score).toBe(100)
    expect(grade).toBe('A')
  })

  it('returns score=100 when bindings array is empty', () => {
    const { score, grade } = calculateScore([], {})
    expect(score).toBe(100)
    expect(grade).toBe('A')
  })
})

describe('grade thresholds', () => {
  const cases: Array<[number, number, string]> = [
    [1, 1, 'A'],   // 100%
    [75, 100, 'B'], // 75%
    [60, 100, 'C'], // 60%
    [40, 100, 'D'], // 40%
    [39, 100, 'F'], // 39%
  ]
  it.each(cases)('passed=%i total=%i → grade=%s', (passed, total, expectedGrade) => {
    const bs = Array.from({ length: total }, (_, i) => binding(`rule.${i}`, 'MEDIUM'))
    const res: Record<string, RuleResult> = {}
    bs.slice(0, passed).forEach((b) => { res[b.ruleId] = { passed: true } })
    bs.slice(passed).forEach((b) => { res[b.ruleId] = { passed: false } })
    const { grade } = calculateScore(bs, res)
    expect(grade).toBe(expectedGrade)
  })
})
