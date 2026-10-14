import { z } from "zod";

export const onboardingSchema = z.object({
  workspaceName: z.string().trim().min(2, "Use at least 2 characters.").max(60),
  projectName: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  clientName: z.string().trim().max(80).optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
