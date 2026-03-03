export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.quality.manage'],
  pageTitle: 'Add Quality Rule',
  pageTitleKey: 'catalog.quality.rules.form.createTitle',
  pageGroup: 'Catalog',
  pageGroupKey: 'catalog.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Quality Rules', labelKey: 'catalog.quality.rules.page.title', href: '/backend/catalog/quality/rules' },
    { label: 'Add Rule', labelKey: 'catalog.quality.rules.form.createTitle' },
  ],
}
