import type { Rule, RuleResult, ProductQualitySnapshot } from '../types'

type AttrMinLengthParams = {
  field: keyof Pick<ProductQualitySnapshot, 'title' | 'subtitle' | 'description' | 'sku' | 'handle'>
  minLength: number
}

export const attrMinLengthRule: Rule<AttrMinLengthParams> = {
  ruleId: 'attr.min_length',
  evaluate(snapshot, params): RuleResult {
    const value = snapshot[params.field]
    const length = typeof value === 'string' ? value.trim().length : 0
    const passed = length >= (params.minLength ?? 1)
    return {
      passed,
      message: passed
        ? undefined
        : `Field "${params.field}" has ${length} characters; minimum required is ${params.minLength}.`,
    }
  },
}
