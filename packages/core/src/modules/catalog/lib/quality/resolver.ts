import type { EntityManager } from '@mikro-orm/postgresql'
import { CatalogDataQualityRule } from '../../data/entities'
import type { ConfiguredRuleBinding, ResolvedRules, Severity } from './types'

export class ConfiguredRuleResolver {
  constructor(private em: EntityManager) { }

  async resolve(tenantId: string, organizationId: string): Promise<ResolvedRules> {
    const rules = await this.em.find(CatalogDataQualityRule, {
      tenantId,
      organizationId,
      isActive: true,
      deletedAt: null,
    })

    return { bindings: rules.map(toBinding) }
  }
}

function toBinding(rule: CatalogDataQualityRule): ConfiguredRuleBinding {
  return {
    bindingKey: rule.id,
    ruleId: rule.ruleId,
    params: rule.params,
    weight: parseFloat(rule.weight),
    severity: rule.severity as Severity,
    highSeverityCap: rule.highSeverityCap,
    conditionExpression: rule.conditionExpression,
  }
}
