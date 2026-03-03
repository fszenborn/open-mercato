import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CatalogDataQualityRule } from '../../../data/entities'
import {
  createQualityRuleSchema,
  updateQualityRuleSchema,
  deleteQualityRuleSchema,
  qualityRuleListQuerySchema,
  qualityRuleItemSchema,
} from '../../../data/validators'
import { parseScopedCommandInput, resolveCrudRecordId } from '../../utils'
import {
  createCatalogCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../../openapi'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  POST: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
}

export const metadata = routeMetadata

const rawBodySchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: CatalogDataQualityRule,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: qualityRuleListQuerySchema,
    buildFilters: async (query) => {
      const filters: Record<string, unknown> = {}
      if (query.isActive !== undefined) {
        filters['isActive'] = query.isActive
      }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'catalog.quality_rules.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(createQualityRuleSchema, raw ?? {}, ctx, translate)
      },
      response: ({ result }) => ({ id: result?.entityId ?? null }),
      status: 201,
    },
    update: {
      commandId: 'catalog.quality_rules.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const payload = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

        const tenantId = (payload.tenantId as string | undefined) ?? ctx.auth?.tenantId ?? null
        if (!tenantId) {
          throw new CrudHttpError(400, { error: translate('errors.tenant_required', 'Tenant context is required.') })
        }
        const organizationId = (payload.organizationId as string | undefined)
          ?? (ctx as any).selectedOrganizationId
          ?? ctx.auth?.orgId
          ?? null

        const id = payload.id
        if (!id || typeof id !== 'string') {
          throw new CrudHttpError(400, { error: translate('errors.id_required', 'Record identifier is required.') })
        }

        const result: Record<string, unknown> = { id, tenantId }
        if (organizationId) result.organizationId = organizationId
        if (payload.ruleId !== undefined) result.ruleId = payload.ruleId
        if (payload.label !== undefined) result.label = payload.label
        if (payload.severity !== undefined) result.severity = payload.severity
        if (payload.weight !== undefined) result.weight = payload.weight
        if (payload.params !== undefined) result.params = payload.params
        if (payload.highSeverityCap !== undefined) result.highSeverityCap = payload.highSeverityCap
        if (payload.isActive !== undefined) result.isActive = payload.isActive

        return result as any
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'catalog.quality_rules.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id = resolveCrudRecordId(parsed, ctx, translate)
        if (!id) {
          throw new CrudHttpError(400, {
            error: translate('catalog.quality.errors.id_required', 'Quality rule id is required.'),
          })
        }
        return parseScopedCommandInput(deleteQualityRuleSchema, { id }, ctx, translate)
      },
      response: () => ({ ok: true }),
    },
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE

export const openApi = createCatalogCrudOpenApi({
  resourceName: 'Quality Rule',
  pluralName: 'Quality Rules',
  querySchema: qualityRuleListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(qualityRuleItemSchema),
  create: {
    schema: createQualityRuleSchema,
    description: 'Creates a new data quality rule for the authenticated organization.',
  },
  update: {
    schema: updateQualityRuleSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates an existing quality rule by id.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Soft-deletes a quality rule by id.',
  },
})
