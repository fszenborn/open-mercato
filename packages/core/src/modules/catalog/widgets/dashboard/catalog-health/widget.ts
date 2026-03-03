import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateSettings, type CatalogHealthWidgetSettings } from './config'

const CatalogHealthWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule<CatalogHealthWidgetSettings> = {
  metadata: {
    id: 'catalog.dashboard.catalogHealth',
    title: 'Catalog Health',
    description: 'Products with quality issues sorted by score.',
    features: ['dashboards.view', 'catalog.widgets.catalog-health'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['catalog'],
    category: 'catalog',
    icon: 'package',
    supportsRefresh: true,
  },
  Widget: CatalogHealthWidget,
  hydrateSettings,
  dehydrateSettings: (settings) => ({
    pageSize: settings.pageSize,
    ...(settings.maxScore !== undefined ? { maxScore: settings.maxScore } : {}),
  }),
}

export default widget
