import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Drop-in replacements for Next's Link / router that keep the visitor in
// their current language. Use these for every internal link.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
