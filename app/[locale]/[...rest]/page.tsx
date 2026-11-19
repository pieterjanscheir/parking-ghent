import { notFound } from "next/navigation";

// Any unknown path under a language prefix lands here, so it gets the
// translated "page not found" screen instead of Next's default one.
export default function CatchAll() {
  notFound();
}
