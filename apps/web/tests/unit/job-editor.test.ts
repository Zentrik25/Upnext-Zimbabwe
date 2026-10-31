import { describe, expect, it } from "vitest";
import {
  buildContent,
  canCreate,
  dayOf,
  detailFromText,
  emptyState,
  hostOf,
  moreDetailFields,
  sourceName,
  stateFromDraft,
  toggleBullets,
} from "@/lib/job-editor";
import type { DraftContent, StaffCategory } from "@/lib/staff-types";

const jobs: StaffCategory = {
  code: "jobs",
  name: "Jobs",
  detail_fields: [
    {
      name: "vacancies",
      type: "integer",
      format: null,
      enum: null,
      item_enum: null,
      item_type: null,
      max_length: null,
      required: false,
    },
    {
      name: "benefits",
      type: "array",
      format: null,
      enum: null,
      item_enum: null,
      item_type: "string",
      max_length: null,
      required: false,
    },
    {
      name: "driving_licence_required",
      type: "boolean",
      format: null,
      enum: null,
      item_enum: null,
      item_type: null,
      max_length: null,
      required: false,
    },
  ],
};
const tenders: StaffCategory = { code: "tenders", name: "Tenders", detail_fields: [] };
const org = { id: "org-1", name: "Acme" };
const today = "2026-10-31";

const stored = {
  title: "Accountant",
  summary: "",
  description_md: "- Keep the books",
  requirements_md: null,
  locations: [
    { location_id: "b", name: "Bulawayo", is_primary: false },
    { location_id: "h", name: "Harare", is_primary: true },
  ],
  location_text: null,
  geographic_eligibility: null,
  work_mode: null,
  employment_type: "full_time",
  experience_level: null,
  salary: null,
  salary_text: "Competitive",
  funding: null,
  deadline_at: "2027-03-01T21:59:59Z",
  deadline_timezone: "Africa/Harare",
  deadline_is_date_only: true,
  application_method: "both",
  application_url: "https://acme.example/apply",
  application_email: "jobs@acme.example",
  application_email_subject: "Accountant",
  application_instructions: null,
  reference_number: null,
  contact_details: null,
  skills: [{ skill_id: "sk-1", name: "Excel", is_required: true }],
  sector_ids: ["s-1"],
  sectors: [],
  sources: [
    {
      kind: "newspaper",
      name: "Herald",
      url: null,
      citation: "Herald 30 Oct, p. 12",
      observed_on: "2026-10-30",
      is_primary: false,
    },
    {
      kind: "issuer_website",
      name: "acme.example",
      url: "https://acme.example/jobs",
      citation: null,
      observed_on: "2026-10-29",
      is_primary: true,
    },
  ],
  detail: { vacancies: 2, benefits: ["Medical aid"] },
  slug: null,
  seo_title: null,
  seo_description: null,
  og_title: null,
  og_description: null,
} as unknown as DraftContent;

const opts = { today, addressLocked: false };

describe("state from a stored draft", () => {
  it("shows what is stored: primary location first, wording salary, primary source, other sources kept", () => {
    const s = stateFromDraft(stored, jobs, org);
    expect(s.locationIds).toEqual(["h", "b"]);
    expect(s.salaryMode).toBe("text");
    expect(s.salaryText).toBe("Competitive");
    expect(s.applyMethod).toBe("both");
    expect(s.sourceUrl).toBe("https://acme.example/jobs");
    expect(s.otherSources).toHaveLength(1);
    expect(s.deadlineDay).toBe("2027-03-01");
    expect(s.detail).toMatchObject({ vacancies: "2", benefits: "Medical aid" });
  });

  it("reads an exact amount and a range from the stored salary", () => {
    const exact = stateFromDraft(
      {
        ...stored,
        salary_text: null,
        salary: { min: "500.00", max: "500.00", currency: "USD", period: "month" },
      },
      jobs,
      org,
    );
    expect([exact.salaryMode, exact.salaryMin, exact.salaryMax]).toEqual(["amount", "500.00", ""]);
    const range = stateFromDraft(
      {
        ...stored,
        salary_text: null,
        salary: { min: "500.00", max: "700.00", currency: "ZWG", period: "year" },
      },
      jobs,
      org,
    );
    expect([range.salaryMode, range.salaryMax, range.salaryCurrency, range.salaryPeriod]).toEqual([
      "range",
      "700.00",
      "ZWG",
      "year",
    ]);
  });
});

describe("the request body", () => {
  it("round-trips a stored draft without inventing or losing anything", () => {
    const s = stateFromDraft(stored, jobs, org);
    const { content, errors } = buildContent(s, jobs, stored, opts);
    expect(errors).toEqual({});
    expect(content.locations).toEqual([
      { location_id: "h", is_primary: true },
      { location_id: "b", is_primary: false },
    ]);
    expect(content.salary).toBeNull();
    expect(content.salary_text).toBe("Competitive");
    expect(content.skills).toEqual([{ skill_id: "sk-1", is_required: true }]);
    expect("deadline_at" in content).toBe(false); // the day did not change
    expect(content.detail).toEqual({ vacancies: 2, benefits: ["Medical aid"] });
    const sources = content.sources as { is_primary: boolean; observed_on: string }[];
    expect(sources.map((x) => x.is_primary)).toEqual([true, false]);
    expect(sources[0]!.observed_on).toBe("2026-10-29"); // an unchanged source keeps its own check date
  });

  it("sends only the chosen application method's fields, and instructions with any method", () => {
    const s = stateFromDraft(stored, jobs, org);
    const web = buildContent(
      { ...s, applyMethod: "external_url", applyInstructions: "Quote the reference" },
      jobs,
      stored,
      opts,
    ).content;
    expect([web.application_url, web.application_email, web.application_email_subject]).toEqual([
      "https://acme.example/apply",
      null,
      null,
    ]);
    expect(web.application_instructions).toBe("Quote the reference");
    const email = buildContent({ ...s, applyMethod: "email" }, jobs, stored, opts).content;
    expect([email.application_url, email.application_email, email.application_email_subject]).toEqual([
      null,
      "jobs@acme.example",
      "Accountant",
    ]);
    const both = buildContent(s, jobs, stored, opts).content;
    expect([both.application_url, both.application_email]).toEqual([
      "https://acme.example/apply",
      "jobs@acme.example",
    ]);
    const none = buildContent(
      { ...s, applyMethod: "instructions", applyInstructions: "Hand deliver to reception" },
      jobs,
      stored,
      opts,
    ).content;
    expect([none.application_url, none.application_email]).toEqual([null, null]); // no fake destination
  });

  it("maps salary modes: exact, range, wording and nothing; never both an amount and wording", () => {
    const s = emptyState("jobs");
    const base = { ...s, organisation: org, title: "T" };
    expect(buildContent({ ...base, salaryMode: "none" }, jobs, null, opts).content).toMatchObject({
      salary: null,
      salary_text: null,
    });
    expect(
      buildContent({ ...base, salaryMode: "amount", salaryMin: "500" }, jobs, null, opts).content,
    ).toMatchObject({
      salary: { min: "500", max: "500", currency: "USD", period: "month" },
      salary_text: null,
    });
    expect(
      buildContent({ ...base, salaryMode: "range", salaryMin: "500", salaryMax: "700" }, jobs, null, opts)
        .content,
    ).toMatchObject({
      salary: { min: "500", max: "700" },
    });
    expect(
      buildContent(
        { ...base, salaryMode: "text", salaryText: " Negotiable ", salaryMin: "9" },
        jobs,
        null,
        opts,
      ).content,
    ).toMatchObject({
      salary: null,
      salary_text: "Negotiable",
    });
  });

  it("carries funding, not pay, for a category that has no pay", () => {
    const s = {
      ...emptyState("tenders"),
      organisation: org,
      title: "T",
      fundingMin: "1000",
      fundingCurrency: "USD",
    };
    const { content } = buildContent(s, tenders, null, opts);
    expect("salary" in content).toBe(false);
    expect(content.funding).toMatchObject({ min: "1000", currency: "USD" });
  });

  it("rewrites the deadline only when the day changed, as an end-of-day Harare time, and clears it when emptied", () => {
    const s = stateFromDraft(stored, jobs, org);
    const moved = buildContent({ ...s, deadlineDay: "2027-04-02" }, jobs, stored, opts).content;
    expect(moved).toMatchObject({
      deadline_at: "2027-04-02T23:59:59+02:00",
      deadline_timezone: "Africa/Harare",
      deadline_is_date_only: true,
    });
    const cleared = buildContent({ ...s, deadlineDay: "" }, jobs, stored, opts).content;
    expect(cleared).toMatchObject({
      deadline_at: null,
      deadline_timezone: null,
      deadline_is_date_only: false,
    });
    expect(
      "deadline_at" in
        buildContent({ ...emptyState("jobs"), organisation: org, title: "T" }, jobs, null, opts).content,
    ).toBe(false);
  });

  it("dates a new or changed source today, and names it from its address without inventing", () => {
    const s = {
      ...emptyState("jobs"),
      organisation: org,
      title: "T",
      sourceUrl: "https://www.herald.co.zw/jobs/1",
      sourceKind: "newspaper",
    };
    const sources = buildContent(s, jobs, null, opts).content.sources as Record<string, unknown>[];
    expect(sources[0]).toMatchObject({
      name: "herald.co.zw",
      observed_on: today,
      is_primary: true,
      citation: null,
    });
    const none = buildContent({ ...s, sourceUrl: "" }, jobs, null, opts).content.sources;
    expect(none).toEqual([]); // no source given: none is made up
  });

  it("never sends an address once it is permanent, and sends a chosen one before", () => {
    const s = { ...stateFromDraft(stored, jobs, org), slug: "my-chosen-address" };
    expect(buildContent(s, jobs, stored, opts).content.slug).toBe("my-chosen-address");
    expect("slug" in buildContent(s, jobs, stored, { ...opts, addressLocked: true }).content).toBe(false);
  });

  it("keeps empty search and sharing text as null so the page derives it", () => {
    const { content } = buildContent(
      { ...emptyState("jobs"), organisation: org, title: "T" },
      jobs,
      null,
      opts,
    );
    expect([content.seo_title, content.seo_description, content.og_title, content.og_description]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("helpers", () => {
  it("reads category details by schema type and reports invalid JSON", () => {
    const { detail, errors } = detailFromText(
      [
        ...jobs.detail_fields,
        {
          name: "fee",
          type: "object",
          format: null,
          enum: null,
          item_enum: null,
          item_type: null,
          max_length: null,
          required: false,
        },
      ],
      {
        vacancies: "3",
        benefits: "Housing\n  Medical aid \n",
        driving_licence_required: "no",
        fee: "{not json",
      },
    );
    expect(detail).toEqual({
      vacancies: 3,
      benefits: ["Housing", "Medical aid"],
      driving_licence_required: false,
    });
    expect(errors["detail.fee"]).toBeTruthy();
  });

  it("promotes vacancies to the main form and keeps the other details under More details", () => {
    expect(moreDetailFields(jobs).map((f) => f.name)).toEqual(["benefits", "driving_licence_required"]);
    expect(moreDetailFields(tenders)).toEqual([]);
  });

  it("toggles bullets on the selected lines only, and back", () => {
    const text = "One\nTwo\nThree";
    const on = toggleBullets(text, 4, 7);
    expect(on.text).toBe("One\n- Two\nThree");
    const off = toggleBullets(on.text, on.start, on.end);
    expect(off.text).toBe(text);
    expect(toggleBullets("A\n\nB", 0, 4).text).toBe("- A\n\n- B");
  });

  it("knows the day of a Harare deadline and the host of an address", () => {
    expect(dayOf("2027-03-01T21:59:59Z")).toBe("2027-03-01");
    expect(dayOf(null)).toBe("");
    expect(hostOf("https://www.example.org/x")).toBe("example.org");
    expect(hostOf("not a url")).toBeNull();
    expect(sourceName("", "issuer_notice", "")).toBe("Issuer notice");
    expect(sourceName("", "other", "Gazette no. 12, p. 4")).toBe("Gazette no. 12, p. 4");
  });

  it("can create a draft only with a category, an organisation and a title", () => {
    const s = emptyState("jobs");
    expect(canCreate(s)).toBe(false);
    expect(canCreate({ ...s, organisation: org, title: "  " })).toBe(false);
    expect(canCreate({ ...s, organisation: org, title: "Accountant" })).toBe(true);
  });
});
