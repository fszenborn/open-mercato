import type { EntityManager } from '@mikro-orm/postgresql'
import { E } from '#generated/entities.ids.generated'
import { CatalogProduct, CatalogDataQualityScore } from '../../data/entities'
import type { Grade, ProductQualitySnapshot, RuleResult } from './types'
import type { ConfiguredRuleResolver } from './resolver'
import { calculateScore } from './calculator'
import { evaluateExpression, type ConditionExpression } from '@open-mercato/core/modules/business_rules'

export class QualityEvaluationService {
  constructor(
    private em: EntityManager,
    private resolver: ConfiguredRuleResolver,
  ) { }

  async evaluateProduct(
    productId: string,
  ): Promise<{ score: number; grade: Grade; previousScore: number | null }> {
    const product = await this.em.findOne(CatalogProduct, { id: productId, deletedAt: null })
    if (!product) {
      throw new Error(`Product not found: ${productId}`)
    }

    const [{ count }] = await this.em.getConnection().execute<[{ count: string }]>(
      `SELECT COUNT(*) AS count FROM attachments WHERE entity_id = ? AND record_id = ? AND organization_id = ? AND tenant_id = ?`,
      [E.catalog.catalog_product, productId, product.organizationId, product.tenantId],
    )
    const mediaCount = parseInt(count, 10)

    const snapshot: ProductQualitySnapshot = {
      id: product.id,
      tenantId: product.tenantId,
      organizationId: product.organizationId,
      title: product.title ?? null,
      subtitle: product.subtitle ?? null,
      description: product.description ?? null,
      sku: product.sku ?? null,
      handle: product.handle ?? null,
      defaultMediaId: product.defaultMediaId ?? null,
      mediaCount,
      metadata: product.metadata ?? null,
    }

    const { bindings } = await this.resolver.resolve(product.tenantId, product.organizationId)

    const results: Record<string, RuleResult> = {}

    for (const binding of bindings) {
      try {
        const passed = evaluateExpression(
          binding.conditionExpression as unknown as ConditionExpression,
          snapshot,
          {},
        )
        results[binding.bindingKey] = { passed, message: passed ? undefined : `Rule "${binding.ruleId}" failed` }
      } catch (err) {
        results[binding.bindingKey] = {
          passed: false,
          message: `Expression evaluation error in "${binding.ruleId}": ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    const { score, grade } = calculateScore(bindings, results)

    const existing = await this.em.findOne(CatalogDataQualityScore, {
      productId,
      tenantId: product.tenantId,
    })

    const previousScore = existing?.score ?? null

    if (existing) {
      existing.score = score
      existing.grade = grade
      existing.violations = results
      existing.evaluatedAt = new Date()
    } else {
      const scoreRecord = this.em.create(CatalogDataQualityScore, {
        productId,
        organizationId: product.organizationId,
        tenantId: product.tenantId,
        score,
        grade,
        violations: results,
        evaluatedAt: new Date(),
      })
      this.em.persist(scoreRecord)
    }

    await this.em.flush()

    return { score, grade, previousScore }
  }
}
