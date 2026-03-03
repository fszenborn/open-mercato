export type CatalogHealthWidgetSettings = {
  pageSize: number
  maxScore?: number
}

export const DEFAULT_SETTINGS: CatalogHealthWidgetSettings = {
  pageSize: 10,
}

export function hydrateSettings(raw: unknown): CatalogHealthWidgetSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const input = raw as Record<string, unknown>
  // Support legacy 'limit' key for backward compatibility with existing stored settings
  const parsedPageSize = Number(input['pageSize'] ?? input['limit'])
  const pageSize =
    Number.isFinite(parsedPageSize) && parsedPageSize >= 1 && parsedPageSize <= 20
      ? Math.floor(parsedPageSize)
      : DEFAULT_SETTINGS.pageSize
  const rawMaxScore = input['maxScore']
  const parsedMaxScore = rawMaxScore !== undefined ? Number(rawMaxScore) : undefined
  const maxScore =
    parsedMaxScore !== undefined &&
    Number.isFinite(parsedMaxScore) &&
    parsedMaxScore >= 0 &&
    parsedMaxScore <= 100
      ? Math.floor(parsedMaxScore)
      : undefined
  return { pageSize, ...(maxScore !== undefined ? { maxScore } : {}) }
}
