import { Code2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Server-rendered JSON syntax highlighter. Walks the pretty-printed JSON and
// wraps each token in a span with a Tailwind colour class so the output reads
// like a polished editor view, with no client-side JS required.
function highlightJson(pretty: string): string {
  return escapeHtml(pretty).replace(
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (_match, key, str, bool, nul, num) => {
      if (key) return `<span class="text-sky-300">${key}</span>`;
      if (str) return `<span class="text-amber-200">${str}</span>`;
      if (bool) return `<span class="text-fuchsia-300">${bool}</span>`;
      if (nul) return `<span class="text-rose-300">${nul}</span>`;
      if (num) return `<span class="text-emerald-300">${num}</span>`;
      return _match;
    },
  );
}

export function JsonBlock({
  data,
  title = "Raw API response",
  subtitle,
  defaultOpen = true,
}: {
  data: unknown;
  title?: string;
  subtitle?: string;
  defaultOpen?: boolean;
}) {
  const pretty = JSON.stringify(data, null, 2) ?? "";
  const html = highlightJson(pretty);
  return (
    <details
      open={defaultOpen}
      className="surface-card group mt-6 overflow-hidden rounded-xl border border-border/70"
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-6 py-4 text-sm font-medium transition-colors hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
        <Code2 className="size-4 text-muted-foreground" />
        <span>{title}</span>
        {subtitle ? (
          <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
        <span className="ml-auto rounded-md border border-border/70 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          JSON
        </span>
        <CopyButton value={pretty} />
      </summary>
      <div className="border-t border-border/70 bg-background/40">
        <pre className="overflow-x-auto p-6 font-mono text-xs leading-relaxed text-foreground/85">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </details>
  );
}
