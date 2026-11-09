import Link from 'next/link';
import { businessAddress, supportEmail } from '@/lib/config';

const PHONE_ICON = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';
const WHATSAPP_ICON = 'M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.560 6.560 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z';
const CHAT_ICON = 'M16 8c0 3.866-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7zM5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0zm4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0zm3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2z';

export function SiteFooter({ phone }: { phone: string }) {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-brand"><img className="brand-logo footer-logo" src="/logo-exclusive.svg" alt="Exclusive Drop Taxi" height={56} /></div>
          <p>Pay only for your one way trip, with the full fare shown before you book.</p>
          <ul>
            <li><a href={`tel:${phone}`}>{phone}</a></li>
            <li><a href={`mailto:${supportEmail}`}>{supportEmail}</a></li>
            <li>{businessAddress}</li>
          </ul>
        </div>
        <div>
          <h4>Services</h4>
          <ul>
            <li><Link href="/services/drop-taxi">Drop taxi</Link></li>
            <li><Link href="/services/round-trip-taxi">Round trip</Link></li>
            <li><Link href="/services/package-trip">Package trip</Link></li>
            <li><Link href="/services/local-trip">Local trip</Link></li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><Link href="/about-us">About us</Link></li>
            <li><Link href="/tariff-chart">Tariff</Link></li>
            <li><Link href="/major-cities">Cities we serve</Link></li>
            <li><Link href="/faq">FAQ</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h4>Policies</h4>
          <ul>
            <li><Link href="/terms">Terms and conditions</Link></li>
            <li><Link href="/cancellation">Cancellation</Link></li>
            <li><Link href="/refund-policy">Refunds</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} Exclusive Drop Taxi. All rights reserved.</div>
    </footer>
  );
}

export function FabStack({ phone, whatsapp }: { phone: string; whatsapp: string }) {
  return (
    <div className="fab-stack">
      <a className="fab" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d={WHATSAPP_ICON} /></svg>
      </a>
      <Link className="fab" href="/contact" aria-label="Message us">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d={CHAT_ICON} /></svg>
      </Link>
      <a className="fab" href={`tel:${phone}`} aria-label="Call us">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PHONE_ICON} /></svg>
      </a>
    </div>
  );
}
