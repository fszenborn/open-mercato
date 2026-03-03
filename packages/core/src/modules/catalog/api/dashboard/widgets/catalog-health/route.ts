import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CatalogDataQualityScore, CatalogProduct } from '../../../../data/entities'
import { resolveWidgetScope } from '../../../../../customers/api/dashboard/widgets/utils'

const querySchema = z.object({
  pageSize: z.coerce.number().min(1).max(20).default(10),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'catalog.widgets.catalog-health'] },
}

export async function GET(req: Request): Promise<NextResponse> {
  const { translate } = await resolveTranslations()

  const url = new URL(req.url)
  const rawQuery = Object.fromEntries(url.searchParams.entries())
  const parseResult = querySchema.safeParse(rawQuery)
  if (!parseResult.success) {
    throw new CrudHttpError(400, { error: translate('catalog.errors.invalid_query', 'Invalid query parameters.') })
  }

  const query = parseResult.data
  const scope = await resolveWidgetScope(req, translate, {
    tenantId: query.tenantId,
    organizationId: query.organizationId,
  })

  const { em, tenantId, organizationIds } = scope

  const orgFilter = organizationIds !== null ? { organizationId: { $in: organizationIds } } : {}

  const scores = await em.find(
    CatalogDataQualityScore,
    {
      tenantId,
      ...orgFilter,
      ...(query.maxScore !== undefined ? { score: { $lte: query.maxScore } } : {}),
    },
    {
      orderBy: { score: 'ASC' },
      limit: query.pageSize,
    },
  )

  if (scores.length === 0) {
    return NextResponse.json({ items: [], total: 0 })
  }

  const productIds = scores.map((s) => s.productId)
  const products = await em.find(CatalogProduct, { id: { $in: productIds }, deletedAt: null })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const total = await em.count(CatalogDataQualityScore, {
    tenantId,
    ...orgFilter,
    ...(query.maxScore !== undefined ? { score: { $lte: query.maxScore } } : {}),
  })

  const items = scores.map((s) => {
    const product = productMap.get(s.productId)
    const issueCount = Object.values(s.violations).filter((v) => !v.passed).length
    return {
      id: s.productId,
      title: product?.title ?? null,
      score: s.score,
      grade: s.grade,
      issueCount,
      evaluatedAt: s.evaluatedAt instanceof Date ? s.evaluatedAt.toISOString() : null,
    }
  })

  return NextResponse.json({ items, total })
}

export const openApi: OpenApiRouteDoc = {
  GET: {
    summary: 'Catalog Health Widget Data',
    description: 'Returns products with the lowest catalog data quality scores for the dashboard widget.',
    tags: ['Catalog'],
    parameters: [
      { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } },
      { name: 'maxScore', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 100 } },
      { name: 'tenantId', in: 'query', schema: { type: 'string', format: 'uuid' } },
      { name: 'organizationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      200: {
        description: 'Widget data retrieved successfully.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      title: { type: 'string', nullable: true },
                      score: { type: 'integer' },
                      grade: { type: 'string' },
                      issueCount: { type: 'integer' },
                      evaluatedAt: { type: 'string', format: 'date-time', nullable: true },
                    },
                  },
                },
                total: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
}
