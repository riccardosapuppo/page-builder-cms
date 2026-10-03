// The theme's header and footer around a page: the twins of the header and
// footer of cms/app/views/layouts/public.html.erb, drawn from what the CMS
// answers for them (GET /api/site, already through its link rules, and
// through this side's again: ./policy.ts). The same on every page; the
// canvas draws them locked (inert), so the page is edited in its place,
// below the header it will have.
import { ThemeSvg } from "./drawings.tsx";
import { linkHref } from "./policy.ts";

// The parts as the API gives them (the storage adapter's Site, written
// here again so the renderer imports nothing of the editor or of storage).
export interface SiteLink {
  label: string;
  href: string;
}

export interface Site {
  name: string;
  menu: readonly SiteLink[];
  action: SiteLink | null;
  footer: { lead: string; text: string };
}

function Link({ link, className }: { link: SiteLink | null; className?: string }) {
  const href = link ? linkHref(link.href) : null;
  if (!link || href === null) return null;
  return <a href={href} className={className}>{link.label}</a>;
}

const links = (menu: readonly SiteLink[]) => menu.map((link, index) => <Link key={index} link={link} />);

export function SiteHeader({ site, locked = false }: { site: Site; locked?: boolean }) {
  return (
    <header className="sw-header" inert={locked || undefined} data-theme-part={locked ? "header" : undefined}>
      <div className="sw-inner sw-header-row">
        <a className="sw-brand" href="/"><ThemeSvg name="mark" className="sw-brand-mark" /><span>{site.name}</span></a>
        <nav className="sw-nav" aria-label="Main">
          <div className="sw-nav-links">{links(site.menu)}</div>
          <Link link={site.action} className="sw-btn sw-btn-small" />
          <details className="sw-menu">
            <summary className="sw-menu-button"><ThemeSvg name="menu" className="sw-menu-icon" />Menu</summary>
            <div className="sw-menu-sheet">{links(site.menu)}</div>
          </details>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ site, locked = false }: { site: Site; locked?: boolean }) {
  return (
    <footer className="sw-footer" inert={locked || undefined} data-theme-part={locked ? "footer" : undefined}>
      <div className="sw-inner sw-footer-row">
        <ThemeSvg name="mark" className="sw-brand-mark sw-brand-mark-inv" />
        <p><strong>{site.footer.lead}</strong> {site.footer.text}</p>
      </div>
    </footer>
  );
}
