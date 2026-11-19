"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Star } from "lucide-react";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { AvailabilityGauge } from "./availability-gauge";
import { FavoriteButton } from "./favorite-button";
import { DataWarning } from "./live-data-warning";
import { ParkingStatusBadge } from "./parking-status-badge";
import { TrendIndicator } from "./trend-indicator";
import { ForecastHint } from "./forecast-hint";
import { useFormatDistance, useParkingLabels } from "./use-labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/lib/favorites";
import type { SortKey } from "@/lib/parkings";

type Props = {
  parkings: Parking[];
  trendsById: Record<string, Trend>;
  distances: Record<string, number | null>;
  // Distances are to the visitor's destination: show walking time too.
  walking: boolean;
  // Current time, for judging how old each garage's count is.
  now: number;
  sort: SortKey;
  onSortChange: (next: SortKey) => void;
};

// Map TanStack header click → SortKey for the URL
const SORT_KEY_MAP: Record<
  string,
  { asc: SortKey; desc: SortKey }
> = {
  name: { asc: "name-asc", desc: "name-desc" },
  freeSpaces: { asc: "spaces-asc", desc: "spaces-desc" },
  freePercent: { asc: "percent-asc", desc: "percent-desc" },
};

function deriveSorting(sort: SortKey): SortingState {
  switch (sort) {
    case "distance":
      return [];
    case "name-asc":
      return [{ id: "name", desc: false }];
    case "name-desc":
      return [{ id: "name", desc: true }];
    case "spaces-asc":
      return [{ id: "freeSpaces", desc: false }];
    case "spaces-desc":
      return [{ id: "freeSpaces", desc: true }];
    case "percent-asc":
      return [{ id: "freePercent", desc: false }];
    case "percent-desc":
      return [{ id: "freePercent", desc: true }];
  }
}

export function ParkingListView({
  parkings,
  trendsById,
  distances,
  walking,
  now,
  sort,
  onSortChange,
}: Props) {
  const router = useRouter();
  const t = useTranslations("list");
  const labels = useParkingLabels();
  const formatDistance = useFormatDistance();
  const { isFavorite } = useFavorites();

  const columns = useMemo<ColumnDef<Parking>[]>(
    () => [
      {
        id: "favorite",
        header: () => <span className="sr-only">{t("favorite")}</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <FavoriteButton parkingId={row.original.id} size="sm" />
        ),
        meta: { className: "w-12" },
      },
      {
        id: "name",
        accessorKey: "name",
        header: t("name"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {isFavorite(row.original.id) ? (
              <Star className="size-3 fill-primary text-primary" />
            ) : null}
            <div className="min-w-0">
              <span className="font-medium">{row.original.name}</span>
              <ForecastHint parking={row.original} trend={trendsById[row.original.id] ?? null} className="flex" />
            </div>
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "isOpen",
        enableSorting: false,
        header: t("status"),
        cell: ({ row }) => <ParkingStatusBadge parking={row.original} />,
      },
      {
        id: "freeSpaces",
        accessorKey: "freeSpaces",
        header: t("free"),
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <span
              className={cn(
                "font-heading font-semibold tabular-nums",
                !row.original.hasLiveData && "text-muted-foreground",
              )}
            >
              {row.original.hasLiveData ? row.original.freeSpaces : "—"}
            </span>
            <DataWarning parking={row.original} now={now} />
          </div>
        ),
        meta: { className: "text-right" },
      },
      {
        id: "trend",
        enableSorting: false,
        header: () => <span className="sr-only">{t("trend")}</span>,
        cell: ({ row }) => {
          if (!row.original.hasLiveData) return null;
          const trend = trendsById[row.original.id];
          if (!trend) return null;
          return (
            <TrendIndicator
              trend={trend}
              currentFree={row.original.freeSpaces}
              size="sm"
            />
          );
        },
        meta: { className: "w-10" },
      },
      {
        id: "freePercent",
        accessorKey: "freePercent",
        header: t("percentFree"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <AvailabilityGauge
              percent={row.original.freePercent}
              bucket={row.original.bucket}
              size="sm"
              showLabel={false}
            />
            <span className="tabular-nums text-sm text-muted-foreground">
              {row.original.hasLiveData
                ? `${Math.round(row.original.freePercent)}%`
                : "—"}
            </span>
          </div>
        ),
      },
      {
        id: "category",
        accessorKey: "categoryLabel",
        enableSorting: false,
        header: t("lez"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {labels.lez(row.original)}
          </span>
        ),
      },
      {
        id: "type",
        accessorKey: "typeLabel",
        enableSorting: false,
        header: t("type"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {labels.type(row.original)}
          </span>
        ),
      },
      {
        id: "address",
        accessorKey: "address",
        enableSorting: false,
        header: t("address"),
        cell: ({ row }) => {
          const d = distances[row.original.id];
          return (
            <span className="text-sm text-muted-foreground">
              {row.original.address}
              {d !== null && d !== undefined ? ` · ${formatDistance(d, walking)}` : ""}
            </span>
          );
        },
      },
    ],
    // `labels` and `formatDistance` are new functions on every render, but
    // only change with the language — which `t` already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isFavorite, trendsById, distances, walking, now, t],
  );

  const sorting = useMemo(() => deriveSorting(sort), [sort]);
  const tableState = useMemo(() => ({ sorting }), [sorting]);
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      const head = next[0];
      if (!head) return;
      const mapping = SORT_KEY_MAP[head.id];
      if (!mapping) return;
      onSortChange(head.desc ? mapping.desc : mapping.asc);
    },
    [sorting, onSortChange],
  );

  const table = useReactTable({
    data: parkings,
    columns,
    state: tableState,
    // Rows arrive pre-sorted by sortParkings (which also handles distance
    // and pushes closed parkings last); the table only renders the arrows.
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: handleSortingChange,
  });

  return (
    <div className="surface-card overflow-hidden rounded-xl border border-border/70">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="bg-muted/30">
              {group.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                const meta = header.column.columnDef.meta as
                  | { className?: string }
                  | undefined;
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "font-heading text-xs uppercase tracking-wide text-muted-foreground",
                      meta?.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : sortDir === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() =>
                router.push(
                  `/parkings/${encodeURIComponent(row.original.id)}`,
                )
              }
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as
                  | { className?: string }
                  | undefined;
                return (
                  <TableCell key={cell.id} className={meta?.className}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
