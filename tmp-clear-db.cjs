const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  throw new Error('.env.local not found');
}

for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i === -1) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = val;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const tables = ['week_menu_items', 'week_menus', 'ingredients', 'steps', 'import_queue', 'recipes'];

(async () => {
  const before = {};
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
    if (error) throw new Error(`Count before failed for ${table}: ${error.message}`);
    before[table] = count ?? 0;
  }

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', 0);
    if (error) throw new Error(`Delete failed for ${table}: ${error.message}`);
  }

  const after = {};
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
    if (error) throw new Error(`Count after failed for ${table}: ${error.message}`);
    after[table] = count ?? 0;
  }

  console.log(JSON.stringify({ before, after }, null, 2));
})().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
