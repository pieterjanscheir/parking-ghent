"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/lib/profile";
import { OnboardingForm } from "@/components/onboarding-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ProfilePageClient() {
  const router = useRouter();
  const { ready, profile, clear } = useProfile();
  const [open, setOpen] = useState(false);

  if (!ready) {
    return <ProfilePageSkeleton />;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </Link>
        <OnboardingForm
          title="Set up your profile"
          description="No profile on this device yet — fill it out to get started."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to overview
      </Link>
      <OnboardingForm
        initialValues={profile}
        title="Your profile"
        description="Update your details — they stay on this device only."
        submitLabel="Save changes"
      />
      <div className="mt-8 surface-card rounded-xl border border-destructive/30 p-5">
        <p className="font-heading text-sm font-semibold">Danger zone</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Remove all your data from this device. This cannot be undone.
        </p>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="mt-3 gap-1.5">
              <Trash2 className="size-3.5" />
              Remove all my data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove all your data?</AlertDialogTitle>
              <AlertDialogDescription>
                Your profile will be deleted from this device. Favorites and
                preferences will remain.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  clear();
                  toast.success("Profile removed");
                  router.push("/");
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="surface-card mx-auto w-full max-w-lg rounded-xl ring-1 ring-foreground/10 p-6 sm:p-8">
        <header className="mb-6 space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </header>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
        <Skeleton className="mt-6 h-9 w-full rounded-md" />
      </div>
      <div className="mt-8 surface-card rounded-xl border border-destructive/30 p-5 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-72" />
        <Skeleton className="mt-3 h-8 w-44 rounded-md" />
      </div>
    </div>
  );
}
