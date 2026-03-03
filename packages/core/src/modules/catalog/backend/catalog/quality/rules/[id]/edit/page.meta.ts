export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.quality.manage'],
  pageTitle: 'Edit Quality Rule',
  pageTitleKey: 'catalog.quality.rules.form.editTitle',
  pageGroup: 'Catalog',
  pageGroupKey: 'catalog.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Quality Rules', labelKey: 'catalog.quality.rules.page.title', href: '/backend/catalog/quality/rules' },
    { label: 'Edit', labelKey: 'common.edit' },
  ],
}
