import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getSearch } from "@/lib/db/queries";
import { getSql } from "@/lib/db/client";
import {
  formatDate,
  formatDistance,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRating,
} from "@/lib/format";
import { AMENITY_LABELS, type AmenityKey } from "@/lib/amenities/canonical";
import type { ResultRow } from "@/components/results/types";
import { roomTypeLabel } from "@/components/results/table";

export const dynamic = "force-dynamic";

/** Comparação lado a lado de até 4 anúncios, com linhas alinhadas. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { id } = await params;
  const { ids } = await searchParams;
  const search = await getSearch(id);
  if (!search) notFound();

  const listingIds = (ids ?? "").split(",").filter(Boolean).slice(0, 4);

  const rows = listingIds.length ? await loadRows(id, listingIds) : [];

  return (
    <AppShell className="mx-auto w-full max-w-6xl gap-4 px-4 py-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Comparação</h1>
        <Link
          href={`/search/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← voltar aos resultados
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Selecione até quatro anúncios na tabela de resultados para compará-los
          aqui.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="w-40 px-2 py-2 text-left font-medium text-muted-foreground" />
                {rows.map((row) => (
                  <th key={row.id} className="px-2 py-2 text-left align-top">
                    <div className="max-w-56 text-sm font-medium">
                      {row.title ?? `Anúncio ${row.external_id}`}
                    </div>
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] text-muted-foreground hover:underline"
                      >
                        abrir no Airbnb
                      </a>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CompareRow
                label="Diária efetiva"
                rows={rows}
                render={(row) => formatMoney(row.effective_nightly, row.currency)}
                strong
              />
              <CompareRow
                label="Diária anunciada"
                rows={rows}
                render={(row) => formatMoney(row.gross_nightly, row.currency)}
              />
              <CompareRow
                label="Total da estadia"
                rows={rows}
                render={(row) => formatMoney(row.total_price, row.currency)}
              />
              <CompareRow
                label="Taxa de limpeza"
                rows={rows}
                render={(row) => formatMoney(row.cleaning_fee, row.currency)}
              />
              <CompareRow
                label="% do total em limpeza"
                rows={rows}
                render={(row) => formatPercent(row.cleaning_ratio, 1)}
              />
              <CompareRow
                label="Por pessoa"
                rows={rows}
                render={(row) => formatMoney(row.price_per_person, row.currency)}
              />
              <CompareRow
                label="Nota geral"
                rows={rows}
                render={(row) => formatRating(row.rating_overall)}
              />
              <CompareRow
                label="Avaliações"
                rows={rows}
                render={(row) => formatNumber(row.review_count)}
              />
              <CompareRow
                label="Limpeza"
                rows={rows}
                render={(row) => formatRating(row.rating_cleanliness)}
              />
              <CompareRow
                label="Localização"
                rows={rows}
                render={(row) => formatRating(row.rating_location)}
              />
              <CompareRow
                label="Última avaliação"
                rows={rows}
                render={(row) => formatDate(row.last_review_at)}
              />
              <CompareRow
                label="Tipo"
                rows={rows}
                render={(row) => roomTypeLabel(row.room_type)}
              />
              <CompareRow
                label="Quartos / camas"
                rows={rows}
                render={(row) =>
                  `${row.bedrooms ?? "—"} / ${row.beds ?? "—"}`
                }
              />
              <CompareRow
                label="Capacidade"
                rows={rows}
                render={(row) => formatNumber(row.person_capacity)}
              />
              <CompareRow
                label="Distância à âncora"
                rows={rows}
                render={(row) => formatDistance(row.min_anchor_distance_m)}
              />
              <CompareRow
                label="Superhost"
                rows={rows}
                render={(row) => (row.host_is_superhost ? "sim" : "não")}
              />
              <CompareRow
                label="Anúncios do anfitrião"
                rows={rows}
                render={(row) => formatNumber(row.host_listing_count)}
              />
              <CompareRow
                label="Amenidades"
                rows={rows}
                render={(row) =>
                  row.amenities?.length
                    ? row.amenities
                        .map((a) => AMENITY_LABELS[a as AmenityKey] ?? a)
                        .join(", ")
                    : "—"
                }
              />
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function CompareRow({
  label,
  rows,
  render,
  strong,
}: {
  label: string;
  rows: ResultRow[];
  render: (row: ResultRow) => string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b">
      <td className="px-2 py-1.5 text-muted-foreground">{label}</td>
      {rows.map((row) => (
        <td
          key={row.id}
          className={strong ? "tnum px-2 py-1.5 font-semibold" : "tnum px-2 py-1.5"}
        >
          {render(row)}
        </td>
      ))}
    </tr>
  );
}

async function loadRows(searchId: string, listingIds: string[]): Promise<ResultRow[]> {
  const sql = await getSql();
  return sql<ResultRow[]>`
    with ultimo_snapshot as (
      select distinct on (listing_id) *
      from listing_snapshots
      where search_id = ${searchId}
      order by listing_id, captured_at desc
    )
    select
      l.*,
      s.nights, s.gross_nightly, s.cleaning_fee, s.service_fee, s.taxes,
      s.discount_total, s.total_price, s.effective_nightly, s.price_per_person,
      s.currency, s.is_available, s.source as price_source,
      s.cleaning_fee / nullif(s.total_price, 0) as cleaning_ratio,
      (select min(extensions.ST_Distance(l.geo, a.geo))::int
        from anchors a where a.search_id = ${searchId}) as min_anchor_distance_m
    from listings l
    left join ultimo_snapshot s on s.listing_id = l.id
    where l.id = any(${listingIds}::uuid[])
  `;
}
