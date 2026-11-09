import 'server-only';
import { query } from './db';
import { cached, clearCaches } from './cache';

export interface Settings {
  gstEnabled: boolean;
  packageEnabled: boolean;
  placesEnabled: boolean;
  supportPhone: string;
  whatsappNumber: string;
}

const DEFAULT_PHONE = '+919047311511';
const DEFAULT_WHATSAPP = '919047311511';

/** Staff-editable switches, read from the database on every call so a change applies at once. */
export function getSettings(): Promise<Settings> {
  return cached('settings', loadSettings);
}

async function loadSettings(): Promise<Settings> {
  const rows = await query<{ setting_key: string; setting_value: string }>('SELECT setting_key, setting_value FROM app_settings');
  const m = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    gstEnabled: m.get('gst_enabled') === 'true', // off unless switched on
    packageEnabled: m.get('package_enabled') !== 'false', // on unless switched off
    placesEnabled: m.get('places_enabled') !== 'false',
    supportPhone: m.get('support_phone') ?? DEFAULT_PHONE,
    whatsappNumber: m.get('whatsapp_number') ?? DEFAULT_WHATSAPP,
  };
}

const KEYS: Record<keyof Settings, string> = {
  gstEnabled: 'gst_enabled',
  packageEnabled: 'package_enabled',
  placesEnabled: 'places_enabled',
  supportPhone: 'support_phone',
  whatsappNumber: 'whatsapp_number',
};

export async function saveSetting(key: keyof Settings, value: string | boolean): Promise<void> {
  await query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [KEYS[key], String(value)],
  );
  clearCaches();
}
