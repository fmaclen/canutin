export type Crumb = { label: string; href?: string };

export function getPageTitle(pageTitle: string, crumbs?: Crumb[]) {
	const parts = crumbs?.length ? crumbs.map((crumb) => crumb.label).reverse() : [pageTitle];
	return [...parts.filter(Boolean), 'Canutin'].join(' · ');
}
