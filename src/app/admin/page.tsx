import { AdminPanel } from '@/components/AdminPanel';
import { pageMeta } from '@/lib/seo';
import { activeCities } from '@/lib/catalog';
import { fareConfig } from '@/lib/config';

export const metadata = pageMeta({ title: 'Admin | droptaxi.com', description: 'Staff admin.', path: '/admin', indexable: false });

export default async function AdminPage() {
  // A brand-new database has no tables yet: still render the sign-in so the admin can run the first-time setup.
  const cities = await activeCities()
    .then((all) => all.filter((c) => c.hasRoutes).map((c) => ({ slug: c.slug, name: c.name })))
    .catch(() => []);
  return (
    <div className="page-wide">
      <AdminPanel routeCities={cities} packages={fareConfig.packages} />
    </div>
  );
}
