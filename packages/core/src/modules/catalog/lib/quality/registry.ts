import type { Rule } from './types'
import { attrRequiredRule } from './rules/attr-required.rule'
import { mediaMinCountRule } from './rules/media-min-count.rule'
import { attrMinLengthRule } from './rules/attr-min-length.rule'

export type RuleParamField = {
  id: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: Array<{ value: string; label: string }>
  required?: boolean
}

const SNAPSHOT_TEXT_FIELDS: Array<{ value: string; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'subtitle', label: 'Subtitle' },
  { value: 'description', label: 'Description' },
  { value: 'sku', label: 'SKU' },
  { value: 'handle', label: 'Handle' },
  { value: 'defaultMediaId', label: 'Primary Image' },
]

export class RuleRegistry {
  private rules = new Map<string, Rule>()
  private paramFields = new Map<string, RuleParamField[]>()

  register(rule: Rule, params: RuleParamField[]): void {
    this.rules.set(rule.ruleId, rule)
    this.paramFields.set(rule.ruleId, params)
  }

  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId)
  }

  listIds(): string[] {
    return Array.from(this.rules.keys())
  }

  getParamFields(ruleId: string): RuleParamField[] {
    return this.paramFields.get(ruleId) ?? []
  }
}

export function createDefaultRuleRegistry(): RuleRegistry {
  const registry = new RuleRegistry()

  registry.register(attrRequiredRule, [
    {
      id: 'field',
      label: 'Field',
      type: 'select',
      required: true,
      options: SNAPSHOT_TEXT_FIELDS,
    },
  ])

  registry.register(mediaMinCountRule, [
    {
      id: 'min',
      label: 'Minimum count',
      type: 'number',
      required: true,
    },
  ])

  registry.register(attrMinLengthRule, [
    {
      id: 'field',
      label: 'Field',
      type: 'select',
      required: true,
      options: SNAPSHOT_TEXT_FIELDS.filter((f) => f.value !== 'defaultMediaId'),
    },
    {
      id: 'minLength',
      label: 'Minimum length',
      type: 'number',
      required: true,
    },
  ])

  return registry
}
