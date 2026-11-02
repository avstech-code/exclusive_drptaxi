import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { FabStack, SiteFooter } from '@/components/SiteFooter';
import { ScrollTop } from '@/components/ScrollTop';
import { getSettings } from '@/lib/settings';
import { siteUrl } from '@/lib/config';

// Pages read live data (staff-editable rates, switches and contact numbers), so nothing is built ahead of time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'droptaxi.com',
  description: 'One way drop taxis across Tamil Nadu, Bangalore and Pondicherry.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0a0b0e' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // On a brand-new database the tables do not exist yet; keep the layout rendering so /admin can run the first-time setup.
  const { supportPhone, whatsappNumber } = await getSettings().catch(() => ({ supportPhone: '', whatsappNumber: '' }));
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SiteHeader phone={supportPhone} />
        <main>{children}</main>
        <SiteFooter phone={supportPhone} />
        <ScrollTop />
        <FabStack phone={supportPhone} whatsapp={whatsappNumber} />
      </body>
    </html>
  );
}
