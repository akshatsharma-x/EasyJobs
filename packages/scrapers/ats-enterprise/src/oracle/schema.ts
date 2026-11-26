import { z } from "zod";

const id = z.union([z.string().trim().min(1), z.number()]).transform(String);
const s = z.string().nullish();

/** GET recruitingCEJobRequisitions — envelope; items[0] is the search, requisitionList its page. */
export const OracleListResponse = z.object({
  items: z
    .array(
      z.object({
        TotalJobsCount: z.number().nullish(),
        requisitionList: z.array(z.unknown()).nullish(),
        locationsFacet: z.array(z.unknown()).nullish(),
      }),
    )
    .nullish(),
});

const Location = z.object({ Name: s, CountryCode: s });

export const OracleRequisition = z.object({
  Id: id,
  Title: z.string().trim().min(1),
  PostedDate: s,
  PostingEndDate: s,
  PrimaryLocation: s,
  PrimaryLocationCountry: s,
  secondaryLocations: z.array(Location).nullish(),
  WorkplaceType: s,
  WorkplaceTypeCode: s,
  JobFamily: s,
  JobFunction: s,
  WorkerType: s,
  ContractType: s,
  JobSchedule: s,
  JobType: s,
  StudyLevel: s,
  Department: s,
  Organization: s,
  BusinessUnit: s,
  ShortDescriptionStr: s,
  HotJobFlag: z.boolean().nullish(),
});
export type OracleRequisition = z.infer<typeof OracleRequisition>;

export const OracleLocationFacet = z.object({ Id: id, Name: z.string(), TotalCount: z.number().nullish() });

/** GET recruitingCEJobRequisitionDetails?finder=ById — items[0]. */
export const OracleDetail = z.object({
  Id: id,
  Title: z.string().trim().min(1),
  ExternalPostedStartDate: s,
  ExternalPostedEndDate: s,
  ExternalDescriptionStr: s,
  ExternalResponsibilitiesStr: s,
  ExternalQualificationsStr: s,
  CorporateDescriptionStr: s,
  OrganizationDescriptionStr: s,
  ShortDescriptionStr: s,
  PrimaryLocation: s,
  PrimaryLocationCountry: s,
  Category: s,
  JobFunction: s,
  JobSchedule: s,
  JobShift: s,
  JobType: s,
  JobLevel: s,
  WorkerType: s,
  ContractType: s,
  StudyLevel: s,
  RequisitionType: s,
  WorkplaceType: s,
  WorkplaceTypeCode: s,
  Department: s,
  Organization: s,
  BusinessUnit: s,
  LegalEmployer: s,
  NumberOfOpenings: z.number().nullish(),
  RequisitionId: z.union([z.string(), z.number()]).nullish(),
  secondaryLocations: z.array(Location).nullish(),
  workLocation: z.array(z.unknown()).nullish(),
  otherWorkLocations: z.array(z.unknown()).nullish(),
  requisitionFlexFields: z.array(z.object({ Prompt: s, Value: s })).nullish(),
  skills: z.array(z.object({ Skill: s })).nullish(),
});
export type OracleDetail = z.infer<typeof OracleDetail>;

export const OracleDetailResponse = z.object({ items: z.array(z.unknown()).nullish() });
