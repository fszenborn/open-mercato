import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CatalogDataQualityRule } from '../data/entities'
import {
  createQualityRuleSchema,
  updateQualityRuleSchema,
  type QualityRuleCreateInput,
  type QualityRuleUpdateInput,
} from '../data/validators'

type CreateInput = QualityRuleCreateInput & { organizationId: string; tenantId: string }
type UpdateInput = QualityRuleUpdateInput & { id: string; organizationId: string; tenantId: string }
type DeleteInput = { id: string; organizationId: string; tenantId: string }

const createQualityRuleCommand: CommandHandler<CreateInput, CommandRuntimeContext> = {
  id: 'catalog.quality_rules.create',
  async execute(input, ctx) {
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const rule = em.create(CatalogDataQualityRule, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      ruleId: input.ruleId,
      label: input.label ?? null,
      severity: input.severity ?? 'MEDIUM',
      weight: String(input.weight ?? 1.0),
      params: input.params ?? {},
      highSeverityCap: input.highSeverityCap ?? 40,
      isActive: input.isActive ?? true,
    })
    em.persist(rule)
    await em.flush()
    return { entityId: rule.id }
  },
}

const updateQualityRuleCommand: CommandHandler<UpdateInput, CommandRuntimeContext> = {
  id: 'catalog.quality_rules.update',
  async execute(input, ctx) {
    const { translate } = await resolveTranslations()
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const rule = await em.findOne(CatalogDataQualityRule, {
      id: input.id,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      deletedAt: null,
    })
    if (!rule) {
      throw new CrudHttpError(404, {
        error: translate('catalog.quality.errors.rule_not_found', 'Quality rule not found'),
      })
    }
    if (input.ruleId !== undefined) rule.ruleId = input.ruleId
    if (input.label !== undefined) rule.label = input.label ?? null
    if (input.severity !== undefined) rule.severity = input.severity
    if (input.weight !== undefined) rule.weight = String(input.weight)
    if (input.params !== undefined) rule.params = input.params
    if (input.highSeverityCap !== undefined) rule.highSeverityCap = input.highSeverityCap
    if (input.isActive !== undefined) rule.isActive = input.isActive
    await em.flush()
    return { entityId: rule.id }
  },
}

const deleteQualityRuleCommand: CommandHandler<DeleteInput, CommandRuntimeContext> = {
  id: 'catalog.quality_rules.delete',
  async execute(input, ctx) {
    const { translate } = await resolveTranslations()
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const rule = await em.findOne(CatalogDataQualityRule, {
      id: input.id,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      deletedAt: null,
    })
    if (!rule) {
      throw new CrudHttpError(404, {
        error: translate('catalog.quality.errors.rule_not_found', 'Quality rule not found'),
      })
    }
    rule.deletedAt = new Date()
    await em.flush()
    return { entityId: rule.id }
  },
}

registerCommand(createQualityRuleCommand)
registerCommand(updateQualityRuleCommand)
registerCommand(deleteQualityRuleCommand)

export { createQualityRuleSchema, updateQualityRuleSchema }
