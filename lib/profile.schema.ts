import { z } from "zod";

export const ProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  licensePlate: z
    .string()
    .trim()
    .min(1, "License plate is required")
    .max(20, "License plate looks too long"),
  carMakeModel: z
    .string()
    .trim()
    .min(1, "Car make and model is required"),
});

export type Profile = z.infer<typeof ProfileSchema>;
