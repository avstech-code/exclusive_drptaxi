'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const PHONE_ICON = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';

const TICKER = '24/7 One Way Drop Taxi  ·  Tamil Nadu  ·  Pondicherry  ·  Bangalore  ·  ';

export function SiteHeader({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const cls = (href: string, exact = false) => ((exact ? path === href : path.startsWith(href)) ? 'active' : undefined);

  // closes the mobile menu when a link inside it is tapped (not when the Services group is toggled)
  const onNavClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  };

  return (
    <>
    <div className="top-bar"><div className="wrap"><a href={`tel:${phone}`}>Get Quick Support: {phone}</a></div></div>
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Exclusive Drop Taxi home">
          <img className="brand-logo" src="/logo-exclusive.jpg" alt="Exclusive Drop Taxi" height={56} />
        </Link>
        <nav className={`site-nav${open ? ' open' : ''}`} id="site-nav" aria-label="Main" onClick={onNavClick}>
          <Link href="/" className={cls('/', true)}>Home</Link>
          <details className="menu">
            <summary>Our services</summary>
            <div className="menu-list">
              <Link href="/services/drop-taxi">Drop taxi</Link>
              <Link href="/services/round-trip-taxi">Round trip</Link>
              <Link href="/services/package-trip">Package trip</Link>
              <Link href="/services/local-trip">Local trip</Link>
            </div>
          </details>
          <Link href="/tariff-chart" className={cls('/tariff-chart')}>Tariff</Link>
          <Link href="/major-cities" className={cls('/major-cities')}>Cities</Link>
          <Link href="/faq" className={cls('/faq')}>FAQ</Link>
          <Link href="/contact" className={cls('/contact')}>Contact</Link>
        </nav>
        <a className="header-call" href={`tel:${phone}`} aria-label="Call us">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PHONE_ICON} /></svg>
          <span className="num">{phone}</span>
        </a>
        <button className="nav-toggle" type="button" aria-controls="site-nav" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </div>
      <div className="ticker" role="marquee" aria-label="24/7 One Way Drop Taxi · Tamil Nadu · Pondicherry · Bangalore">
        <div className="ticker-track" aria-hidden="true">
          {[0, 1].map((i) => <span key={i}>{TICKER}</span>)}
        </div>
      </div>
    </header>
    </>
  );
}
