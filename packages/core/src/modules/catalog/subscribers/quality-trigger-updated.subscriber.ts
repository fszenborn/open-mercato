import { enqueueQualityEvaluation } from '../lib/quality/subscriber-handler'

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

export default async function handle(payload: ProductEventPayload): Promise<void> {
  await enqueueQualityEvaluation(payload)
}
