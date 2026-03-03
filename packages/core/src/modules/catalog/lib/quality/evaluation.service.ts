import type { EntityManager } from '@mikro-orm/postgresql'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { E } from '#generated/entities.ids.generated'
import { CatalogProduct, CatalogDataQualityScore } from '../../data/entities'
import type { Grade, ProductQualitySnapshot, RuleResult } from './types'
import type { ConfiguredRuleResolver } from './resolver'
import type { RuleRegistry } from './registry'
import { calculateScore } from './calculator'
import { evaluateExpression, type ConditionExpression } from '@open-mercato/core/modules/business_rules/lib/expression-evaluator'

export class QualityEvaluationService {
  constructor(
    private em: EntityManager,
    private resolver: ConfiguredRuleResolver,
    private registry: RuleRegistry,
  ) { }

  async evaluateProduct(
    productId: string,
  ): Promise<{ score: number; grade: Grade; previousScore: number | null }> {
    const product = await this.em.findOne(CatalogProduct, { id: productId, deletedAt: null })
    if (!product) {
      throw new Error(`Product not found: ${productId}`)
    }

    const mediaCount = await this.em.count(Attachment, {
      entityId: E.catalog.catalog_product,
      recordId: productId,
      organizationId: product.organizationId,
      tenantId: product.tenantId,
    })

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
      if (binding.conditionExpression) {
        try {
          // Use BR expression evaluator
          const passed = evaluateExpression(
            binding.conditionExpression as unknown as ConditionExpression,
            snapshot,
            {}
          )
          results[binding.bindingKey] = { passed, message: passed ? undefined : `Rule failed` }
        } catch (err) {
          results[binding.bindingKey] = {
            passed: false,
            message: `Expression evaluation error: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      } else {
        const rule = this.registry.get(binding.ruleId)
        if (!rule) {
          results[binding.bindingKey] = { passed: false, message: `Unknown rule class: ${binding.ruleId}` }
          continue
        }
        try {
          results[binding.bindingKey] = rule.evaluate(snapshot, binding.params)
        } catch (err) {
          results[binding.bindingKey] = {
            passed: false,
            message: `Rule evaluation error: ${err instanceof Error ? err.message : String(err)}`,
          }
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
