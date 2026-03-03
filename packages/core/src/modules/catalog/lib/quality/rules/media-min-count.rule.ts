import type { Rule, RuleResult, ProductQualitySnapshot } from '../types'

type MediaMinCountParams = {
  min: number
}

export const mediaMinCountRule: Rule<MediaMinCountParams> = {
  ruleId: 'media.min_count',
  evaluate(snapshot, params): RuleResult {
    const passed = snapshot.mediaCount >= (params.min ?? 1)
    return {
      passed,
      message: passed
        ? undefined
        : `Product has ${snapshot.mediaCount} media item(s); minimum required is ${params.min}.`,
    }
  },
}
