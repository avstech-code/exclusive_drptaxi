import { after } from 'next/server';
import { api, ApiError, clientIp, rateLimit, readJson } from '@/lib/http';
import { sendEnquiryNotification } from '@/lib/notify';

interface Body {
  customerName?: string;
  mobile?: string;
  tripType?: string;
  from?: string;
  to?: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  returnDate?: string | null;
  packageHours?: number | null;
  distanceKm?: number | null;
  fares?: { vehicle?: string; total?: number }[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const dateOk = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const timeOk = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);

/** "Explore cabs" pressed on the home page: emails the office the visitor's details so the lead is not lost. */
export const POST = api(async (req) => {
  const b = await readJson<Body>(req);
  const ip = clientIp(req);
  rateLimit(`enquiry:${ip}`, 10, 60_000);
  const customerName = str(b.customerName, 100);
  const mobile = str(b.mobile, 10);
  if (!customerName || !/^[6-9][0-9]{9}$/.test(mobile)) throw new ApiError(400, 'Name and a valid mobile number are required');
  const tripType = ['ONE_WAY', 'ROUND_TRIP', 'PACKAGE'].includes(b.tripType ?? '') ? (b.tripType as string) : 'ONE_WAY';
  const fares = (Array.isArray(b.fares) ? b.fares : []).slice(0, 10)
    .map((f) => ({ vehicle: str(f.vehicle, 60), total: Number(f.total) }))
    .filter((f) => f.vehicle && Number.isFinite(f.total));
  const alert = {
    customerName, mobile, tripType, from: str(b.from, 200) || '-', to: str(b.to, 200) || '-',
    pickupDate: dateOk(b.pickupDate), pickupTime: timeOk(b.pickupTime), returnDate: dateOk(b.returnDate),
    packageHours: Number.isFinite(Number(b.packageHours)) && b.packageHours ? Number(b.packageHours) : null,
    distanceKm: Number.isFinite(Number(b.distanceKm)) && b.distanceKm ? Number(b.distanceKm) : null,
    fares, ip,
  };
  after(() => sendEnquiryNotification(alert));
  return { ok: true };
});
