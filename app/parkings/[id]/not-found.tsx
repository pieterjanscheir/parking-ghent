import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ParkingNotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
        404
      </p>
      <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
        Parking not found
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t find a parking with that ID.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to overview</Link>
      </Button>
    </div>
  );
}
