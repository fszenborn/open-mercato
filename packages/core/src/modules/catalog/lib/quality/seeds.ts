import type { EntityManager } from '@mikro-orm/postgresql'
import { CatalogDataQualityRule } from '../../data/entities'

type Scope = { tenantId: string; organizationId: string }

type DefaultRule = {
  ruleId: string
  label: string
  severity: string
  weight: string
  highSeverityCap: number
  conditionExpression: Record<string, unknown>
}

const DEFAULT_RULES: DefaultRule[] = [
  {
    ruleId: 'quality.title.required',
    label: 'Title required',
    severity: 'BLOCKER',
    weight: '1.0',
    highSeverityCap: 40,
    conditionExpression: { operator: 'IS_NOT_EMPTY', field: 'title' },
  },
  {
    ruleId: 'quality.description.required',
    label: 'Description required',
    severity: 'HIGH',
    weight: '1.0',
    highSeverityCap: 40,
    conditionExpression: { operator: 'IS_NOT_EMPTY', field: 'description' },
  },
  {
    ruleId: 'quality.primary_image.required',
    label: 'Primary image required',
    severity: 'HIGH',
    weight: '1.0',
    highSeverityCap: 40,
    conditionExpression: { operator: 'IS_NOT_EMPTY', field: 'defaultMediaId' },
  },
  {
    ruleId: 'quality.sku.required',
    label: 'SKU required',
    severity: 'MEDIUM',
    weight: '1.0',
    highSeverityCap: 40,
    conditionExpression: { operator: 'IS_NOT_EMPTY', field: 'sku' },
  },
  {
    ruleId: 'quality.media.min_one',
    label: 'At least 1 media',
    severity: 'MEDIUM',
    weight: '0.5',
    highSeverityCap: 40,
    conditionExpression: { operator: '>=', field: 'mediaCount', value: 1 },
  },
  {
    ruleId: 'quality.subtitle.recommended',
    label: 'Subtitle recommended',
    severity: 'LOW',
    weight: '0.5',
    highSeverityCap: 40,
    conditionExpression: { operator: 'IS_NOT_EMPTY', field: 'subtitle' },
  },
]

export async function seedDefaultQualityRules(
  em: EntityManager,
  scope: Scope,
): Promise<void> {
  for (const rule of DEFAULT_RULES) {
    const existing = await em.findOne(CatalogDataQualityRule, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      ruleId: rule.ruleId,
      label: rule.label,
    })
    if (existing) continue

    const record = em.create(CatalogDataQualityRule, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      ruleId: rule.ruleId,
      label: rule.label,
      severity: rule.severity,
      weight: rule.weight,
      conditionExpression: rule.conditionExpression,
      highSeverityCap: rule.highSeverityCap,
      isActive: true,
    })
    em.persist(record)
  }
  await em.flush()
}

