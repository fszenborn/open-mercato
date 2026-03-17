import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CatalogDataQualityRule } from '../../../../data/entities'
import { updateQualityRuleSchema, qualityRuleItemSchema } from '../../../../data/validators'

const paramsSchema = z.object({ id: z.string().uuid() })

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  PATCH: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
}

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const rule = await em.findOne(CatalogDataQualityRule, {
    id: parsed.data.id,
    tenantId: auth.tenantId,
    organizationId: auth.orgId,
    deletedAt: null,
  })
  if (!rule) return NextResponse.json({ error: 'Quality rule not found' }, { status: 404 })

  return NextResponse.json({
    id: rule.id,
    ruleId: rule.ruleId,
    label: rule.label ?? null,
    severity: rule.severity,
    weight: parseFloat(rule.weight),
    conditionExpression: rule.conditionExpression ?? null,
    highSeverityCap: rule.highSeverityCap,
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  })
}

export async function PATCH(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { translate } = await resolveTranslations()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: translate('errors.invalid_json', 'Invalid JSON body') }, { status: 400 })
  }

  const input = updateQualityRuleSchema.safeParse({
    ...(typeof body === 'object' && body !== null ? body : {}),
    id: parsed.data.id,
  })
  if (!input.success) {
    return NextResponse.json({ error: 'Validation failed', issues: input.error.issues }, { status: 422 })
  }

  const container = await createRequestContainer()
  const commandBus = container.resolve('commandBus') as CommandBus
  await commandBus.execute('catalog.quality_rules.update', {
    input: {
      ...input.data,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
    },
    ctx: { container, auth },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const container = await createRequestContainer()
  const commandBus = container.resolve('commandBus') as CommandBus
  await commandBus.execute('catalog.quality_rules.delete', {
    input: {
      id: parsed.data.id,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
    },
    ctx: { container, auth },
  })

  return NextResponse.json({ ok: true })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Catalog Quality',
  summary: 'Quality rule resource operations',
  description: 'GET, PATCH, and DELETE a single quality rule by ID.',
  responses: {
    GET: {
      200: {
        description: 'Quality rule detail',
        schema: qualityRuleItemSchema,
      },
      404: { description: 'Rule not found' },
    },
    PATCH: {
      200: { description: 'Rule updated', schema: z.object({ ok: z.boolean() }) },
      422: { description: 'Validation failed' },
    },
    DELETE: {
      200: { description: 'Rule deleted', schema: z.object({ ok: z.boolean() }) },
    },
  },
}

