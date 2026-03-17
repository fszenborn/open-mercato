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

    return { bindings: rules.filter(hasConditionExpression).map(toBinding) }
  }
}

function hasConditionExpression(rule: CatalogDataQualityRule): boolean {
  return rule.conditionExpression != null && typeof rule.conditionExpression === 'object'
}

function toBinding(rule: CatalogDataQualityRule): ConfiguredRuleBinding {
  return {
    bindingKey: rule.id,
    ruleId: rule.ruleId,
    conditionExpression: rule.conditionExpression as Record<string, unknown>,
    weight: parseFloat(rule.weight),
    severity: rule.severity as Severity,
    highSeverityCap: rule.highSeverityCap,
  }
}

