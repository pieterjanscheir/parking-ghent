"use client";

import { useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { searchKnownPlaces, type Place } from "@/lib/destinations";
import { MIN_QUERY_LENGTH, geocodeInGhent } from "@/lib/geocode";
import { cn } from "@/lib/utils";

type Props = {
  // The destination currently in effect, if any.
  selected: Place | null;
  onSelect: (place: Place) => void;
  onClear: () => void;
};

// What the OpenStreetMap search returned for `query`.
type Remote =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; places: Place[] }
  | { status: "error"; query: string };

type Row =
  | { kind: "place"; place: Place }
  // "Search all of Ghent for …": runs the OpenStreetMap search.
  | { kind: "search" };

const SEARCH_TIMEOUT_MS = 8_000;

// "Where are you going?" — a text box with suggestions. Well-known places
// appear instantly while typing; anything else (a street, a shop) is looked
// up on OpenStreetMap, but only when the visitor asks for it.
export function DestinationSearch({ selected, onSelect, onClear }: Props) {
  const t = useTranslations("destination");
  const locale = useLocale();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const [text, setText] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remote, setRemote] = useState<Remote>({ status: "idle" });

  const query = text.trim();
  // Results from OpenStreetMap only apply to the exact text they were for.
  const remoteForQuery = remote.status !== "idle" && remote.query === query ? remote : null;
  const known = searchKnownPlaces(query);
  const remotePlaces =
    remoteForQuery?.status === "done"
      ? remoteForQuery.places.filter(
          (place) => !known.some((k) => k.name === place.name),
        )
      : [];
  // Offered until this text has been looked up — and again after a failed
  // lookup, so a timeout can be retried without retyping.
  const canSearch =
    query.length >= MIN_QUERY_LENGTH &&
    (!remoteForQuery || remoteForQuery.status === "error");

  const rows: Row[] = [
    ...known.map((place): Row => ({ kind: "place", place })),
    ...remotePlaces.map((place): Row => ({ kind: "place", place })),
    ...(canSearch ? [{ kind: "search" } as const] : []),
  ];
  const active = Math.min(activeIndex, Math.max(0, rows.length - 1));

  // Drop the lookup in flight, if any. The ref is emptied *before* aborting:
  // the abort rejects the fetch, and that rejection must not be mistaken for
  // a real failure of a search the visitor has already moved on from.
  function cancelSearch() {
    const controller = requestRef.current;
    requestRef.current = null;
    controller?.abort();
  }

  function choose(place: Place) {
    cancelSearch();
    setText(place.name);
    setOpen(false);
    setRemote({ status: "idle" });
    onSelect(place);
    inputRef.current?.blur();
  }

  async function searchEverywhere() {
    cancelSearch();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    setRemote({ status: "loading", query });
    try {
      const places = await geocodeInGhent(query, locale, controller.signal);
      // Replaced by a newer search, or cancelled: this outcome no longer counts.
      if (requestRef.current !== controller) return;
      setRemote({ status: "done", query, places });
      // Put the highlight on the first new result.
      setActiveIndex(known.length);
    } catch {
      // Same check. A timeout leaves the ref alone, so it does show an error.
      if (requestRef.current !== controller) return;
      setRemote({ status: "error", query });
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function activate(row: Row | undefined) {
    if (!row) return;
    if (row.kind === "place") choose(row.place);
    else void searchEverywhere();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Composing text (Japanese, Chinese, Korean keyboards): Enter and the
    // arrows belong to the keyboard's own candidate list, not to ours.
    // Safari reports the confirming Enter as key code 229 instead.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (rows.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((active + step + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      if (!open || rows.length === 0) return;
      e.preventDefault();
      activate(rows[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  function clear() {
    cancelSearch();
    setText("");
    setRemote({ status: "idle" });
    setActiveIndex(0);
    if (selected) onClear();
    inputRef.current?.focus();
  }

  const status =
    remoteForQuery?.status === "loading"
      ? t("searching")
      : remoteForQuery?.status === "error"
        ? t("error")
        : remoteForQuery?.status === "done" && remotePlaces.length === 0
          ? t("noResults", { query })
          : null;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Close when focus leaves the whole widget, not when it moves inside it.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label
        htmlFor={`${listId}-input`}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t("label")}
      </label>
      <div className="relative">
        <MapPin
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2",
            selected ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <Input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && rows.length > 0 ? `${listId}-row-${active}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={t("placeholder")}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn("h-10 pl-9 pr-9", selected && "border-primary/50")}
        />
        {text ? (
          <button
            type="button"
            onClick={clear}
            aria-label={t("clear")}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-lg border border-border/70 bg-popover text-popover-foreground shadow-lg">
          {!query && known.length > 0 ? (
            <p className="px-3 pt-2.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("popular")}
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label={t("label")} className="max-h-72 overflow-y-auto p-1.5">
            {rows.map((row, index) => (
              <li
                key={row.kind === "place" ? row.place.id : "search"}
                id={`${listId}-row-${index}`}
                role="option"
                aria-selected={index === active}
                // Keep focus in the text box, so the list doesn't close
                // before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => activate(row)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm",
                  index === active && "bg-muted",
                )}
              >
                {row.kind === "place" ? (
                  <>
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.place.name}</span>
                      {row.place.detail ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.place.detail}
                        </span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    <Search className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="text-primary">{t("searchAll", { query })}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {status ? (
            <p
              role="status"
              className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5 text-xs text-muted-foreground"
            >
              {remoteForQuery?.status === "loading" ? (
                <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
              ) : null}
              {status}
            </p>
          ) : null}
          {remoteForQuery ? (
            <p className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
              {t("attribution")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
