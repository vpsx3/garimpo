-- Popula listings.geo a partir de lat/lng.
create or replace function public.listings_sync_geo()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.lat is null or new.lng is null then
    new.geo := null;
  else
    new.geo := extensions.ST_SetSRID(
      extensions.ST_MakePoint(new.lng, new.lat), 4326
    )::extensions.geography;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_sync_geo_trg on public.listings;
create trigger listings_sync_geo_trg
  before insert or update of lat, lng on public.listings
  for each row execute function public.listings_sync_geo();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listings_touch_updated_at_trg on public.listings;
create trigger listings_touch_updated_at_trg
  before update on public.listings
  for each row execute function public.touch_updated_at();

drop trigger if exists listing_verdicts_touch_updated_at_trg on public.listing_verdicts;
create trigger listing_verdicts_touch_updated_at_trg
  before update on public.listing_verdicts
  for each row execute function public.touch_updated_at();
