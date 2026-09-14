-- Definição de busca reutilizável: o "o quê" e o "onde".
create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  location_query text not null,
  bbox extensions.geography(Polygon, 4326),
  check_in date not null,
  check_out date not null,
  guests int not null default 2,
  adults int,
  children int,
  infants int,
  pets int,
  max_gross_nightly numeric,
  currency text not null default 'BRL',
  is_tracked boolean not null default false,
  last_ingested_at timestamptz,
  created_at timestamptz not null default now(),
  constraint searches_dates_ordered check (check_out > check_in),
  constraint searches_guests_positive check (guests > 0)
);

-- Anúncio, único por origem.
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  url text,
  title text,
  property_type text,
  room_type text,
  person_capacity int,
  bedrooms int,
  beds int,
  bathrooms numeric,
  is_shared_bathroom boolean,
  lat double precision,
  lng double precision,
  geo extensions.geography(Point, 4326),
  picture_count int,
  picture_urls text[],
  rating_overall numeric,
  review_count int,
  rating_cleanliness numeric,
  rating_accuracy numeric,
  rating_checkin numeric,
  rating_communication numeric,
  rating_location numeric,
  rating_value numeric,
  first_review_at date,
  last_review_at date,
  reviews_per_month numeric,
  host_external_id text,
  host_name text,
  host_is_superhost boolean,
  host_since date,
  host_listing_count int,
  host_response_rate int,
  host_response_time text,
  cancellation_policy text,
  instant_bookable boolean,
  min_nights int,
  max_nights int,
  description text,
  house_rules text,
  space_text text,
  neighborhood_text text,
  amenities text[] not null default '{}',
  raw jsonb not null default '{}'::jsonb,
  detail_fetched_at timestamptz,
  reviews_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists listings_geo_idx on public.listings using gist (geo);
create index if not exists listings_amenities_idx on public.listings using gin (amenities);
create index if not exists listings_rating_idx on public.listings (rating_overall, review_count);

-- Preço de um anúncio para uma busca específica, num instante.
create table if not exists public.listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings on delete cascade,
  search_id uuid references public.searches on delete cascade,
  captured_at timestamptz not null default now(),
  nights int not null,
  gross_nightly numeric,
  cleaning_fee numeric,
  service_fee numeric,
  taxes numeric,
  discount_total numeric,
  total_price numeric not null,
  effective_nightly numeric,
  price_per_person numeric,
  currency text not null default 'BRL',
  is_available boolean not null default true,
  -- de onde veio o preço: a busca ampla (estimado) ou a cotação (confirmado)
  source text not null default 'search' check (source in ('search', 'quote')),
  raw jsonb,
  constraint listing_snapshots_nights_positive check (nights > 0)
);

create index if not exists listing_snapshots_listing_captured_idx
  on public.listing_snapshots (listing_id, captured_at desc);
create index if not exists listing_snapshots_search_price_idx
  on public.listing_snapshots (search_id, effective_nightly);

-- Avaliações, para filtro textual.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings on delete cascade,
  external_id text,
  created_at_source date,
  rating int,
  language text,
  comment text,
  tsv tsvector generated always as (
    to_tsvector('portuguese'::regconfig, coalesce(comment, ''))
  ) stored,
  unique (listing_id, external_id)
);

create index if not exists reviews_tsv_idx on public.reviews using gin (tsv);
create index if not exists reviews_listing_idx on public.reviews (listing_id);

-- Pontos de referência do usuário para filtro de distância.
create table if not exists public.anchors (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.searches on delete cascade,
  label text not null,
  address text,
  geo extensions.geography(Point, 4326) not null,
  max_distance_m int,
  weight numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists anchors_search_idx on public.anchors (search_id);
create index if not exists anchors_geo_idx on public.anchors using gist (geo);

-- Conjunto de filtros salvo, aplicável a qualquer busca.
create table if not exists public.filter_sets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  definition jsonb not null,
  scoring_weights jsonb,
  created_at timestamptz not null default now()
);

-- Triagem manual.
create table if not exists public.listing_verdicts (
  listing_id uuid primary key references public.listings on delete cascade,
  verdict text not null check (verdict in ('shortlist', 'rejected', 'seen')),
  note text,
  updated_at timestamptz not null default now()
);

-- Alertas disparados.
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  search_id uuid references public.searches on delete cascade,
  listing_id uuid references public.listings on delete cascade,
  kind text not null check (kind in ('price_drop', 'new_match', 'became_unavailable')),
  payload jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists alerts_unread_idx on public.alerts (created_at desc) where read_at is null;

-- Cache de geocoding (Nominatim): nenhum endereço é consultado duas vezes.
create table if not exists public.geocode_cache (
  query text primary key,
  lat double precision,
  lng double precision,
  display_name text,
  raw jsonb,
  created_at timestamptz not null default now()
);
