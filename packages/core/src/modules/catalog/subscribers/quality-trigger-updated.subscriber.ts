import { createQueue } from '@open-mercato/queue'
import {
  CATALOG_QUALITY_QUEUE_NAME,
  type QualityEvaluationJob,
} from '../lib/quality/queue-types'

export const metadata = {
  event: 'catalog.product.updated',
  persistent: true,
  id: 'catalog:quality-trigger-updated',
}

type ProductEventPayload = {
  id: string
  tenantId: string
  organizationId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(
  payload: ProductEventPayload,
  _ctx: ResolverContext,
): Promise<void> {
  try {
    const strategy = process.env.QUEUE_STRATEGY === 'async' ? 'async' : 'local'
    const queue = createQueue<QualityEvaluationJob>(CATALOG_QUALITY_QUEUE_NAME, strategy)
    await queue.enqueue({
      productId: payload.id,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })
  } catch (err) {
    console.error('[catalog:quality-trigger] Failed to enqueue quality evaluation:', err)
  }
}
