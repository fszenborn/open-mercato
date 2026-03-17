import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CatalogDataQualityRule } from '../../../data/entities'
import {
  createQualityRuleSchema,
  qualityRuleListQuerySchema,
  qualityRuleItemSchema,
} from '../../../data/validators'
import { parseScopedCommandInput } from '../../utils'
import {
  createCatalogCrudOpenApi,
  createPagedListResponseSchema,
} from '../../openapi'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  POST: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
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
  },
})

export const GET = crud.GET
export const POST = crud.POST

export const openApi = createCatalogCrudOpenApi({
  resourceName: 'Quality Rule',
  pluralName: 'Quality Rules',
  querySchema: qualityRuleListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(qualityRuleItemSchema),
  create: {
    schema: createQualityRuleSchema,
    description: 'Creates a new data quality rule for the authenticated organization.',
  },
})

