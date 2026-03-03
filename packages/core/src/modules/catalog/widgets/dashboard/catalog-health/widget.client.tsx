"use client"

import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEFAULT_SETTINGS, hydrateSettings, type CatalogHealthWidgetSettings } from './config'

type CatalogHealthItem = {
  id: string
  title: string | null
  score: number
  grade: string
  issueCount: number
  evaluatedAt: string | null
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  B: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  C: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  D: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  F: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

async function loadWidgetData(settings: CatalogHealthWidgetSettings): Promise<{ items: CatalogHealthItem[]; total: number }> {
  const params = new URLSearchParams({ pageSize: String(settings.pageSize) })
  if (settings.maxScore !== undefined) params.set('maxScore', String(settings.maxScore))
  const call = await apiCall<{ items?: unknown[]; total?: number; error?: string }>(
    `/api/catalog/dashboard/widgets/catalog-health?${params.toString()}`,
  )
  if (!call.ok) {
    const err = (call.result as Record<string, unknown> | null)?.error
    throw new Error(typeof err === 'string' ? err : `Request failed with status ${call.status}`)
  }
  const payload = call.result ?? {}
  const rawItems = Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : []
  const items = rawItems
    .map((item: unknown): CatalogHealthItem | null => {
      if (!item || typeof item !== 'object') return null
      const data = item as Record<string, unknown>
      return {
        id: typeof data.id === 'string' ? data.id : '',
        title: typeof data.title === 'string' ? data.title : null,
        score: typeof data.score === 'number' ? data.score : 0,
        grade: typeof data.grade === 'string' ? data.grade : 'F',
        issueCount: typeof data.issueCount === 'number' ? data.issueCount : 0,
        evaluatedAt: typeof data.evaluatedAt === 'string' ? data.evaluatedAt : null,
      }
    })
    .filter((item: CatalogHealthItem | null): item is CatalogHealthItem => !!item && !!item.id)
  const total = typeof (payload as { total?: unknown }).total === 'number'
    ? (payload as { total: number }).total
    : items.length
  return { items, total }
}

const CatalogHealthWidget: React.FC<DashboardWidgetComponentProps<CatalogHealthWidgetSettings>> = ({
  mode,
  settings = DEFAULT_SETTINGS,
  onSettingsChange,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const hydrated = React.useMemo(() => hydrateSettings(settings), [settings])
  const [items, setItems] = React.useState<CatalogHealthItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const data = await loadWidgetData(hydrated)
      setItems(data.items)
      setTotal(data.total)
    } catch (err) {
      console.error('Failed to load catalog health widget data', err)
      setError(t('catalog.widgets.catalogHealth.error', 'Failed to load catalog health data.'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [hydrated, onRefreshStateChange, t])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  if (mode === 'settings') {
    return (
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <label htmlFor="catalog-health-limit" className="text-xs font-semibold uppercase text-muted-foreground">
            {t('catalog.widgets.catalogHealth.settings.pageSize', 'Items to display')}
          </label>
          <input
            id="catalog-health-limit"
            type="number"
            min={1}
            max={20}
            className="w-24 rounded-md border px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={hydrated.pageSize}
            onChange={(event) => {
              const next = Number(event.target.value)
              onSettingsChange({ ...hydrated, pageSize: Number.isFinite(next) && next >= 1 ? next : hydrated.pageSize })
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('catalog.widgets.catalogHealth.empty', 'No product quality scores available yet.')}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => {
              const gradeColor = GRADE_COLORS[item.grade] ?? GRADE_COLORS['F']
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/backend/catalog/products/${encodeURIComponent(item.id)}`}
                      className="block truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {item.title ?? t('catalog.widgets.catalogHealth.untitled', 'Untitled product')}
                    </Link>
                    {item.issueCount > 0 ? (
                      <p className="text-xs text-muted-foreground">{item.issueCount} issue{item.issueCount !== 1 ? 's' : ''}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-sm text-muted-foreground">{item.score}%</span>
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${gradeColor}`}>
                      {item.grade}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {total > items.length ? (
            <p className="text-xs text-muted-foreground">
              {t('catalog.widgets.catalogHealth.showing', `Showing ${items.length} of ${total} evaluated products.`)}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

export default CatalogHealthWidget
