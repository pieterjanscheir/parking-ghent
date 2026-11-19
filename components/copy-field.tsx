"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// A value to copy (an address, a command) with a button that does it. The
// text itself can also be selected by hand, for browsers that refuse.
export function CopyField({
  value,
  copyLabel,
  copiedLabel,
}: {
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No clipboard access: the visitor can still select the text.
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap rounded-md border border-border/70 bg-muted/50 px-3 py-2 font-mono text-sm">
        {value}
      </code>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copy}>
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
      </Button>
    </div>
  );
}
