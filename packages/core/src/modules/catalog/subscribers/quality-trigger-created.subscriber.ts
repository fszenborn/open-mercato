import { enqueueQualityEvaluation } from '../lib/quality/subscriber-handler'

export const metadata = {
  event: 'catalog.product.created',
  persistent: true,
  id: 'catalog:quality-trigger-created',
}

type ProductEventPayload = {
  id: string
  tenantId: string
  organizationId: string
}

export default async function handle(payload: ProductEventPayload): Promise<void> {
  await enqueueQualityEvaluation(payload)
}
