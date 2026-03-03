import type { Rule, RuleResult, ProductQualitySnapshot } from '../types'

type AttrRequiredParams = {
  field: keyof Pick<
    ProductQualitySnapshot,
    'title' | 'subtitle' | 'description' | 'sku' | 'handle' | 'defaultMediaId'
  >
}

export const attrRequiredRule: Rule<AttrRequiredParams> = {
  ruleId: 'attr.required',
  evaluate(snapshot, params): RuleResult {
    const value = snapshot[params.field]
    const passed = value !== null && value !== undefined && String(value).trim().length > 0
    return {
      passed,
      message: passed ? undefined : `Field "${params.field}" is required but missing or empty.`,
    }
  },
}
