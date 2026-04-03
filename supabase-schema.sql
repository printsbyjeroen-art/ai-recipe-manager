create table if not exists public.recipes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text default '' not null,
  servings integer not null default 2,
  calories_per_serving numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  meal_type text not null,
  dish_type text not null,
  prep_time integer not null default 0,
  cook_time integer not null default 0,
  source_url text default '' not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  name text not null,
  amount numeric not null,
  unit text not null,
  store_section text not null default 'miscellaneous',
  calories_per_100g numeric not null default 0,
  protein_g_per_100g numeric not null default 0,
  carbs_g_per_100g numeric not null default 0,
  fat_g_per_100g numeric not null default 0
);

create table if not exists public.steps (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  step_number integer not null,
  instruction text not null
);

create index if not exists recipes_meal_type_idx on public.recipes (meal_type);
create index if not exists recipes_dish_type_idx on public.recipes (dish_type);
create index if not exists recipes_created_at_idx on public.recipes (created_at desc);

alter table public.recipes
  add column if not exists calories_per_serving numeric not null default 0,
  add column if not exists protein_g numeric not null default 0,
  add column if not exists carbs_g numeric not null default 0,
  add column if not exists fat_g numeric not null default 0;

alter table public.ingredients
  add column if not exists store_section text not null default 'miscellaneous',
  add column if not exists calories_per_100g numeric not null default 0,
  add column if not exists protein_g_per_100g numeric not null default 0,
  add column if not exists carbs_g_per_100g numeric not null default 0,
  add column if not exists fat_g_per_100g numeric not null default 0;

create table if not exists public.import_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  status text not null default 'pending', -- pending | processing | failed | completed
  error text,
  response_text text,
  recipe_id bigint references public.recipes (id) on delete set null,
  process_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_attempt_at timestamptz
);

create index if not exists import_queue_status_idx on public.import_queue (status);
create index if not exists import_queue_created_at_idx on public.import_queue (created_at desc);

alter table public.import_queue
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists process_after timestamptz;
create index if not exists import_queue_user_id_idx on public.import_queue (user_id);
create index if not exists import_queue_process_after_idx on public.import_queue (process_after);

create table if not exists public.week_menus (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create table if not exists public.week_menu_items (
  id bigint generated always as identity primary key,
  week_menu_id bigint not null references public.week_menus (id) on delete cascade,
  day_of_week integer not null, -- 0=Mon ... 6=Sun
  meal_slot text not null, -- breakfast | lunch | dinner | snack | dessert
  recipe_id bigint references public.recipes (id) on delete set null,
  planned_servings integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_menu_id, day_of_week, meal_slot)
);

create index if not exists week_menus_week_start_idx on public.week_menus (week_start_date);
create index if not exists week_menu_items_week_menu_idx on public.week_menu_items (week_menu_id);

alter table public.week_menu_items
  add column if not exists planned_servings integer;

-- Row Level Security: each user can only see and modify their own data
alter table public.recipes enable row level security;
alter table public.week_menus enable row level security;
alter table public.week_menu_items enable row level security;

-- Recipes: only owner can CRUD
drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own" on public.recipes
  for select using (auth.uid() = user_id);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own" on public.recipes
  for insert with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own" on public.recipes
  for update using (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own" on public.recipes
  for delete using (auth.uid() = user_id);

-- Week menus: only owner can CRUD
drop policy if exists "week_menus_select_own" on public.week_menus;
create policy "week_menus_select_own" on public.week_menus
  for select using (auth.uid() = user_id);

drop policy if exists "week_menus_insert_own" on public.week_menus;
create policy "week_menus_insert_own" on public.week_menus
  for insert with check (auth.uid() = user_id);

drop policy if exists "week_menus_update_own" on public.week_menus;
create policy "week_menus_update_own" on public.week_menus
  for update using (auth.uid() = user_id);

drop policy if exists "week_menus_delete_own" on public.week_menus;
create policy "week_menus_delete_own" on public.week_menus
  for delete using (auth.uid() = user_id);

-- Week menu items: access only via owning week_menu
drop policy if exists "week_menu_items_via_menu" on public.week_menu_items;
create policy "week_menu_items_via_menu" on public.week_menu_items
  for all using (
    exists (
      select 1 from public.week_menus
      where week_menus.id = week_menu_items.week_menu_id
        and week_menus.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.week_menus
      where week_menus.id = week_menu_items.week_menu_id
        and week_menus.user_id = auth.uid()
    )
  );


