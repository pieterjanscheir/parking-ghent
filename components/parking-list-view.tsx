"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Star } from "lucide-react";
import type { Parking } from "@/lib/parkings.schema";
import type { Trend } from "@/lib/parking-history";
import { AvailabilityGauge } from "./availability-gauge";
import { FavoriteButton } from "./favorite-button";
import { ParkingStatusBadge } from "./parking-status-badge";
import { TrendIndicator } from "./trend-indicator";
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
  sort,
  onSortChange,
}: Props) {
  const router = useRouter();
  const { isFavorite } = useFavorites();

  const columns = useMemo<ColumnDef<Parking>[]>(
    () => [
      {
        id: "favorite",
        header: () => <span className="sr-only">Favorite</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <FavoriteButton parkingId={row.original.id} size="sm" />
        ),
        meta: { className: "w-12" },
      },
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {isFavorite(row.original.id) ? (
              <Star className="size-3 fill-primary text-primary" />
            ) : null}
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "isOpen",
        enableSorting: false,
        header: "Status",
        cell: ({ row }) => <ParkingStatusBadge parking={row.original} />,
      },
      {
        id: "freeSpaces",
        accessorKey: "freeSpaces",
        header: "Free",
        cell: ({ row }) => (
          <span className="font-heading font-semibold tabular-nums">
            {row.original.freeSpaces}
          </span>
        ),
        meta: { className: "text-right" },
      },
      {
        id: "trend",
        enableSorting: false,
        header: () => <span className="sr-only">Trend</span>,
        cell: ({ row }) => {
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
        header: "% free",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <AvailabilityGauge
              percent={row.original.freePercent}
              bucket={row.original.bucket}
              size="sm"
              showLabel={false}
            />
            <span className="tabular-nums text-sm">
              {Math.round(row.original.freePercent)}%
            </span>
          </div>
        ),
      },
      {
        id: "category",
        accessorKey: "categoryLabel",
        enableSorting: false,
        header: "LEZ",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.categoryLabel}
          </span>
        ),
      },
      {
        id: "type",
        accessorKey: "typeLabel",
        enableSorting: false,
        header: "Type",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.typeLabel}
          </span>
        ),
      },
      {
        id: "address",
        accessorKey: "address",
        enableSorting: false,
        header: "Address",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.address}
          </span>
        ),
      },
    ],
    [isFavorite, trendsById],
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
    manualSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
