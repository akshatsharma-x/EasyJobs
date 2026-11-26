import { z } from "zod";

const id = z.union([z.string().trim().min(1), z.number()]).transform(String);
const s = z.string().nullish();
const strList = z.array(z.string()).nullish();
const epoch = z.number().nullish();

/** Legacy API: GET /api/apply/v2/jobs?domain=…&start=…&num=10 */
export const EfV2List = z.object({ count: z.number().nullish(), positions: z.array(z.unknown()).nullish() });

export const EfV2Position = z.object({
  id,
  name: z.string().trim().min(1),
  posting_name: s,
  location: s,
  locations: strList,
  department: s,
  business_unit: s,
  t_create: epoch,
  t_update: epoch,
  ats_job_id: s,
  display_job_id: s,
  job_description: s,
  work_location_option: s,
  location_flexibility: s,
  canonicalPositionUrl: s,
  custom_JD: z.object({ data_fields: z.record(z.string(), z.unknown()).nullish() }).nullish(),
});
export type EfV2Position = z.infer<typeof EfV2Position>;

/** PCSX API: GET /api/pcsx/search?domain=…&start=… → { data: { count, positions } } */
export const EfPcsxList = z.object({
  data: z.object({ count: z.number().nullish(), positions: z.array(z.unknown()).nullish() }),
});

export const EfPcsxPosition = z.object({
  id,
  name: z.string().trim().min(1),
  displayJobId: s,
  atsJobId: s,
  locations: strList,
  standardizedLocations: strList,
  location: s,
  postedTs: epoch,
  creationTs: epoch,
  department: s,
  workLocationOption: s,
  locationFlexibility: s,
  positionUrl: s,
  publicUrl: s,
  jobDescription: s,
  efcustomTextTimeType: strList,
});
export type EfPcsxPosition = z.infer<typeof EfPcsxPosition>;

/** GET /api/pcsx/position_details?position_id=…&domain=… → { data: position } */
export const EfPcsxDetail = z.object({ data: z.unknown() });
