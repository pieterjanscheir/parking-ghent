"use client";

import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import { useProfile } from "@/lib/profile";
import { ProfileSchema, type Profile } from "@/lib/profile.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";

type Props = {
  initialValues?: Profile;
  submitLabel?: string;
  onSaved?: () => void;
  title?: string;
  description?: string;
};

export function OnboardingForm({
  initialValues,
  submitLabel = "Save profile",
  onSaved,
  title = "Welcome aboard",
  description = "Tell us about you and your car. We keep it on this device only.",
}: Props) {
  const { save } = useProfile();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Profile>({
    resolver: standardSchemaResolver(ProfileSchema),
    defaultValues: initialValues,
  });

  const onSubmit = handleSubmit((values) => {
    try {
      save({ ...values, licensePlate: values.licensePlate.toUpperCase() });
      toast.success("Profile saved");
      onSaved?.();
    } catch {
      toast.error("Something went wrong saving your profile.");
    }
  });

  return (
    <div className="surface-card mx-auto w-full max-w-lg rounded-xl ring-1 ring-foreground/10 p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <form onSubmit={onSubmit} noValidate>
        <FieldSet>
          <FieldLegend className="sr-only">Driver and car details</FieldLegend>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errors.firstName ? "true" : undefined}>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  aria-invalid={errors.firstName ? true : undefined}
                  {...register("firstName")}
                />
                {errors.firstName ? (
                  <FieldError>{errors.firstName.message}</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={errors.lastName ? "true" : undefined}>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  aria-invalid={errors.lastName ? true : undefined}
                  {...register("lastName")}
                />
                {errors.lastName ? (
                  <FieldError>{errors.lastName.message}</FieldError>
                ) : null}
              </Field>
            </div>
            <Field data-invalid={errors.licensePlate ? "true" : undefined}>
              <FieldLabel htmlFor="licensePlate">License plate</FieldLabel>
              <Input
                id="licensePlate"
                autoComplete="off"
                placeholder="1-ABC-123"
                className="uppercase"
                aria-invalid={errors.licensePlate ? true : undefined}
                {...register("licensePlate")}
              />
              <FieldDescription>
                Stored locally — used only to identify your car.
              </FieldDescription>
              {errors.licensePlate ? (
                <FieldError>{errors.licensePlate.message}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={errors.carMakeModel ? "true" : undefined}>
              <FieldLabel htmlFor="carMakeModel">
                Make and model
              </FieldLabel>
              <Input
                id="carMakeModel"
                autoComplete="off"
                placeholder="Volkswagen Golf"
                aria-invalid={errors.carMakeModel ? true : undefined}
                {...register("carMakeModel")}
              />
              {errors.carMakeModel ? (
                <FieldError>{errors.carMakeModel.message}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
        </FieldSet>
        <div className="mt-6">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
