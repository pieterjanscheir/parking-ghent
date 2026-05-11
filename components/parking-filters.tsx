"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export type ParkingFiltersValue = {
  status: string[];
  lez: string[];
  type: string[];
  bucket: string[];
};

type Props = {
  value: ParkingFiltersValue;
  onChange: (next: Partial<ParkingFiltersValue>) => void;
  typeOptions: Option[];
  onClear: () => void;
};

const STATUS_OPTIONS: Option[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const LEZ_OPTIONS: Option[] = [
  { value: "inside", label: "Inside LEZ" },
  { value: "outside", label: "Outside LEZ" },
];

const BUCKET_OPTIONS: Option[] = [
  { value: "available", label: "Available" },
  { value: "almost-full", label: "Almost full" },
  { value: "full", label: "Full" },
];

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-col gap-1.5">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 cursor-pointer",
                checked && "text-foreground",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function ParkingFilters({
  value,
  onChange,
  typeOptions,
  onClear,
}: Props) {
  const activeCount =
    value.status.length +
    value.lez.length +
    value.type.length +
    value.bucket.length;

  function toggleIn(
    key: keyof ParkingFiltersValue,
    optionValue: string,
  ): string[] {
    const list = value[key];
    return list.includes(optionValue)
      ? list.filter((v) => v !== optionValue)
      : [...list, optionValue];
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="size-3.5" />
          <span>Filters</span>
          {activeCount > 0 ? (
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-4">
        <div className="flex items-center justify-between">
          <p className="font-heading text-sm font-semibold">Filters</p>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Clear all
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-col gap-4">
          <FacetGroup
            title="Status"
            options={STATUS_OPTIONS}
            selected={value.status}
            onToggle={(v) => onChange({ status: toggleIn("status", v) })}
          />
          <FacetGroup
            title="Low emission zone"
            options={LEZ_OPTIONS}
            selected={value.lez}
            onToggle={(v) => onChange({ lez: toggleIn("lez", v) })}
          />
          <FacetGroup
            title="Type"
            options={typeOptions}
            selected={value.type}
            onToggle={(v) => onChange({ type: toggleIn("type", v) })}
          />
          <FacetGroup
            title="Availability"
            options={BUCKET_OPTIONS}
            selected={value.bucket}
            onToggle={(v) => onChange({ bucket: toggleIn("bucket", v) })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
