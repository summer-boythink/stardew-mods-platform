import type { ReactNode } from 'react';
import { Breadcrumb, type BreadcrumbItem } from '@pixelvale/ui';

export interface PageHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional breadcrumb trail; the current page should be the last item. */
  breadcrumb?: readonly BreadcrumbItem[];
  actions?: ReactNode;
  eyebrow?: ReactNode;
}

/**
 * Consistent page masthead. Each page owns exactly one <h1>; section panels
 * below it start at h2 so the document outline stays predictable.
 */
export function PageHeading({
  title,
  description,
  breadcrumb,
  actions,
  eyebrow,
}: PageHeadingProps): JSX.Element {
  return (
    <div className="page-heading">
      {breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb className="page-heading__crumbs" items={breadcrumb} label="面包屑导航" />
      ) : null}
      {eyebrow ? <p className="page-heading__eyebrow">{eyebrow}</p> : null}
      <div className="page-heading__row">
        <div className="page-heading__copy">
          <h1 className="page-heading__title">{title}</h1>
          {description ? <p className="page-heading__desc">{description}</p> : null}
        </div>
        {actions ? <div className="page-heading__actions">{actions}</div> : null}
      </div>
    </div>
  );
}
