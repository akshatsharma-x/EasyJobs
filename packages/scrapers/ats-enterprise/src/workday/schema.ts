import { z } from "zod";

/** POST {apiBase}/jobs — envelope. Items are validated one by one (schema drift tolerance). */
export const WorkdayListResponse = z.object({
  total: z.number().nullish(),
  jobPostings: z.array(z.unknown()).nullish(),
  facets: z.array(z.unknown()).nullish(),
});
export type WorkdayListResponse = z.infer<typeof WorkdayListResponse>;

export const WorkdayPosting = z.object({
  title: z.string().trim().min(1),
  externalPath: z.string().trim().min(2),
  locationsText: z.string().nullish(),
  postedOn: z.string().nullish(),
  bulletFields: z.array(z.string()).nullish(),
  remoteType: z.string().nullish(),
});
export type WorkdayPosting = z.infer<typeof WorkdayPosting>;

/** GET {apiBase}{externalPath} */
export const WorkdayDetail = z.object({
  jobPostingInfo: z.object({
    id: z.string().nullish(),
    title: z.string().trim().min(1),
    jobDescription: z.string().nullish(),
    location: z.string().nullish(),
    additionalLocations: z.array(z.string()).nullish(),
    postedOn: z.string().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    timeType: z.string().nullish(),
    jobReqId: z.string().nullish(),
    jobPostingId: z.string().nullish(),
    remoteType: z.string().nullish(),
    externalUrl: z.string().nullish(),
    canApply: z.boolean().nullish(),
    country: z.object({ descriptor: z.string().nullish(), alpha2Code: z.string().nullish() }).nullish(),
    jobRequisitionLocation: z
      .object({
        descriptor: z.string().nullish(),
        country: z.object({ descriptor: z.string().nullish(), alpha2Code: z.string().nullish() }).nullish(),
      })
      .nullish(),
  }),
  hiringOrganization: z.object({ name: z.string().nullish() }).nullish(),
});
export type WorkdayDetail = z.infer<typeof WorkdayDetail>;
