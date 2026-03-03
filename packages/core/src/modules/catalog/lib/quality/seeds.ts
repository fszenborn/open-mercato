import type { EntityManager } from '@mikro-orm/postgresql'
import { CatalogDataQualityRule } from '../../data/entities'

type Scope = { tenantId: string; organizationId: string }

type DefaultRule = {
  ruleId: string
  label: string
  severity: string
  weight: string
  params: Record<string, unknown>
  highSeverityCap: number
}

const DEFAULT_RULES: DefaultRule[] = [
  {
    ruleId: 'attr.required',
    label: 'Title required',
    severity: 'BLOCKER',
    weight: '1.0',
    params: { field: 'title' },
    highSeverityCap: 40,
  },
  {
    ruleId: 'attr.required',
    label: 'Description required',
    severity: 'HIGH',
    weight: '1.0',
    params: { field: 'description' },
    highSeverityCap: 40,
  },
  {
    ruleId: 'attr.required',
    label: 'Primary image required',
    severity: 'HIGH',
    weight: '1.0',
    params: { field: 'defaultMediaId' },
    highSeverityCap: 40,
  },
  {
    ruleId: 'attr.required',
    label: 'SKU required',
    severity: 'MEDIUM',
    weight: '1.0',
    params: { field: 'sku' },
    highSeverityCap: 40,
  },
  {
    ruleId: 'media.min_count',
    label: 'At least 1 media',
    severity: 'MEDIUM',
    weight: '0.5',
    params: { min: 1 },
    highSeverityCap: 40,
  },
  {
    ruleId: 'attr.required',
    label: 'Subtitle recommended',
    severity: 'LOW',
    weight: '0.5',
    params: { field: 'subtitle' },
    highSeverityCap: 40,
  },
]

/**
 * Seeds default quality rules for a tenant/organization.
 * Idempotent: matches on (tenantId + organizationId + ruleId + label).
 */
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
      params: rule.params,
      highSeverityCap: rule.highSeverityCap,
      isActive: true,
    })
    em.persist(record)
  }
  await em.flush()
}
