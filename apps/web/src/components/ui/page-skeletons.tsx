import type { ReactNode } from "react";
import { SeekerNav, type SeekerSection } from "@/components/seeker/seeker-nav";
import { Container } from "@/components/layout";
import {
  LoadingRegion,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonChoiceGroup,
  SkeletonHeading,
  SkeletonInput,
  SkeletonLine,
  SkeletonListingRows,
  SkeletonMetricGrid,
  SkeletonPageHeader,
  SkeletonTable,
  SkeletonTabs,
  SkeletonText,
} from "./skeleton";

/**
 * Page-level compositions of the primitives, one per page shape, for the route-level `loading.tsx` files of the
 * private routes. Each keeps what is static on the real page (its navigation) and draws placeholders only for what
 * waits for data. None of them renders a name, an e-mail address, a count or any other value: until the session and
 * the data are resolved nothing private is known, so nothing private can be shown.
 */

/** A jobseeker page: header band, the shared navigation (static, so it is real), then the body. */
export function SeekerPageLoading({
  current,
  label,
  intro,
  children,
}: {
  current: SeekerSection;
  label: string;
  /** Height class of the page's real introduction at phone and desktop widths (see `SkeletonPageHeader`). */
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="border-b border-line py-[22px]">
        <Container>
          <LoadingRegion label={label}>
            <SkeletonPageHeader intro={intro} />
          </LoadingRegion>
        </Container>
      </section>
      <SeekerNav current={current} />
      <Container className="pt-[18px] pb-[65px]">
        <div aria-hidden="true" className="skeleton-pulse">
          {children}
        </div>
      </Container>
    </>
  );
}

/** Saved opportunities and For you: a category tab strip and a page of listing rows. */
export function SeekerListLoading({
  current,
  label,
  intro,
  rows = 5,
}: {
  current: SeekerSection;
  label: string;
  intro: string;
  rows?: number;
}) {
  return (
    <SeekerPageLoading current={current} label={label} intro={intro}>
      <div className="-mt-[18px] mb-[18px]">
        <SkeletonTabs />
      </div>
      <div className="border-t border-line">
        <SkeletonListingRows count={rows} />
      </div>
    </SeekerPageLoading>
  );
}

/** The jobseeker overview: two lists, then the profile and alerts panels. */
export function SeekerOverviewLoading() {
  return (
    <SeekerPageLoading current="dashboard" label="your dashboard" intro="h-[45px] sm:h-[22px]">
      <div className="grid gap-8">
        {[0, 1].map((section) => (
          <div key={section}>
            <SkeletonHeading size="section" className="mb-3" />
            <div className="border-t border-line">
              <SkeletonListingRows count={3} />
            </div>
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </SeekerPageLoading>
  );
}

/** The profile form: the "what you are looking for" fields, then the long lists of categories, places and sectors. */
export function ProfileLoading() {
  return (
    <SeekerPageLoading current="profile" label="your profile" intro="h-[112px] sm:h-[45px]">
      <div className="grid gap-6">
        <div className="grid min-h-[352px] content-start gap-3 sm:min-h-[199px]">
          <SkeletonHeading size="title" />
          <SkeletonInput />
          <SkeletonInput />
        </div>
        <SkeletonChoiceGroup rows={24} />
        <SkeletonButton className="w-[140px]" />
      </div>
    </SeekerPageLoading>
  );
}

/** The alerts form: how often, which categories, which places, then the save button. */
export function AlertsLoading() {
  return (
    <SeekerPageLoading current="alerts" label="your alerts" intro="h-[67px] sm:h-[22px]">
      <div className="grid gap-6">
        <SkeletonChoiceGroup rows={2} />
        <SkeletonChoiceGroup rows={6} />
        <SkeletonChoiceGroup rows={16} />
        <SkeletonButton className="w-[140px]" />
      </div>
    </SeekerPageLoading>
  );
}

/** The account hub: title, profile summary, five settings rows and the sign-out button. */
export function AccountLoading() {
  return (
    <Container className="pt-6 pb-[65px]">
      <LoadingRegion label="your account">
        <SkeletonPageHeader />
        <div className="mt-1 grid max-w-[640px] gap-3">
          <div className="flex items-center gap-3 rounded-card border border-border-panel p-3">
            <SkeletonAvatar className="h-14 w-14 rounded-feature" />
            <div className="grid min-w-0 flex-1 gap-2">
              <SkeletonLine className="h-[18px] w-1/2" />
              <SkeletonLine className="w-2/3" />
            </div>
            <SkeletonButton className="w-[56px]" />
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-[56px] items-center gap-3 rounded-card border border-border-panel px-3 py-3"
            >
              <SkeletonAvatar className="h-9 w-9" />
              <div className="grid min-w-0 flex-1 gap-2">
                <SkeletonLine className="h-[16px] w-1/3" />
                <SkeletonLine className="w-3/4" />
              </div>
            </div>
          ))}
          <SkeletonButton />
        </div>
      </LoadingRegion>
    </Container>
  );
}

/** An account settings sub-page: back link, title and description, then one or two cards of fields. */
export function AccountSectionLoading({ label, cards = 1 }: { label: string; cards?: number }) {
  return (
    <Container className="pt-4 pb-[65px]">
      <LoadingRegion label={label}>
        <SkeletonLine className="h-[24px] w-[140px]" />
        <div className="mt-2">
          <SkeletonPageHeader />
        </div>
        <div className="grid max-w-[640px] gap-4">
          {Array.from({ length: cards }, (_, index) => (
            <SkeletonCard key={index}>
              <SkeletonHeading size="title" />
              <SkeletonInput />
              <SkeletonInput />
              <SkeletonButton />
            </SkeletonCard>
          ))}
        </div>
      </LoadingRegion>
    </Container>
  );
}

/** The employer dashboard: title, the organisation's figures, then its submitted opportunities. */
export function EmployerDashboardLoading() {
  return (
    <Container className="pt-6 pb-[65px]">
      <LoadingRegion label="the employer portal">
        <SkeletonPageHeader action />
        <div className="mt-2 grid gap-5">
          <SkeletonMetricGrid count={3} />
          <div>
            <SkeletonHeading size="section" className="mb-2" />
            <div className="border-b border-line">
              <SkeletonTable rows={5} columns={4} />
            </div>
          </div>
        </div>
      </LoadingRegion>
    </Container>
  );
}

/** An employer form or detail page: back link, title, and a card of fields. */
export function EmployerFormLoading({ label }: { label: string }) {
  return (
    <Container className="pt-6 pb-[65px]">
      <LoadingRegion label={label}>
        <SkeletonLine className="mb-3 w-[120px]" />
        <SkeletonPageHeader />
        <div className="grid max-w-[760px] gap-4">
          <SkeletonCard>
            <SkeletonHeading size="title" />
            <SkeletonInput />
            <SkeletonInput />
            <SkeletonText lines={4} />
          </SkeletonCard>
          <SkeletonCard lines={3} />
        </div>
      </LoadingRegion>
    </Container>
  );
}

/** The workspace dashboard: welcome band, figures, two panels, and the latest opportunities table. */
export function WorkspaceDashboardLoading() {
  return (
    <LoadingRegion label="the workspace">
      <div className="mb-5 min-h-[180px] rounded-feature border border-border-interest bg-match-bg p-6 sm:min-h-[200px]">
        <div className="grid max-w-[46ch] gap-3">
          <SkeletonLine className="h-[34px] w-2/3" />
          <SkeletonLine className="w-full" />
          <SkeletonButton className="mt-2 w-[160px]" />
        </div>
      </div>
      <div className="mb-5">
        <SkeletonMetricGrid count={5} />
      </div>
      <div className="@container mb-4">
        <div className="grid gap-4 @min-[820px]:grid-cols-[5fr_7fr]">
          <WorkspacePanel rows={4} />
          <WorkspacePanel rows={4} />
        </div>
      </div>
      <div className="min-w-0 rounded-card border border-border-panel bg-surface shadow-subtle">
        <div className="px-4 pt-[14px] pb-[10px]">
          <SkeletonHeading size="title" />
        </div>
        <SkeletonTable rows={5} columns={6} />
      </div>
    </LoadingRegion>
  );
}

function WorkspacePanel({ rows }: { rows: number }) {
  return (
    <div className="min-w-0 rounded-card border border-border-panel bg-surface shadow-subtle">
      <div className="px-4 pt-[14px] pb-[10px]">
        <SkeletonHeading size="title" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-h-[48px] items-center gap-3 border-t border-line px-4 py-2">
          <div className="h-[18px] w-[18px] flex-none bg-line" />
          <SkeletonLine className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** A workspace list: title and action, an optional filter bar, and the table (cards below 768px). */
export function WorkspaceListLoading({
  label,
  filters = true,
  action = false,
  columns = 6,
}: {
  label: string;
  filters?: boolean;
  action?: boolean;
  columns?: number;
}) {
  return (
    <LoadingRegion label={label}>
      <SkeletonPageHeader action={action} />
      {filters ? (
        <>
          <SkeletonTabs count={7} />
          <div className="my-4 grid gap-3 rounded-card border border-line bg-surface-pale p-3 sm:grid-cols-2 min-[1100px]:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <SkeletonInput label={false} />
            <SkeletonInput label={false} />
            <SkeletonInput label={false} className="max-sm:hidden" />
            <SkeletonInput label={false} className="max-sm:hidden" />
            <SkeletonButton className="max-sm:hidden" />
          </div>
        </>
      ) : null}
      <div className="rounded-card border border-border-panel bg-surface shadow-subtle">
        <SkeletonTable rows={10} columns={columns} />
      </div>
    </LoadingRegion>
  );
}

/** A workspace record or listing: back link, title with status, then cards of fields. */
export function WorkspaceDetailLoading({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <SkeletonLine className="w-[160px]" />
      <div className="mt-3 mb-4">
        <SkeletonPageHeader action />
      </div>
      <div className="grid gap-4">
        <SkeletonCard lines={2} />
        <SkeletonCard>
          <SkeletonHeading size="title" />
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="grid gap-1 border-t border-line py-2 sm:grid-cols-[200px_1fr] sm:gap-4"
            >
              <SkeletonLine className="w-1/2" />
              <SkeletonLine className="w-5/6" />
            </div>
          ))}
        </SkeletonCard>
      </div>
    </LoadingRegion>
  );
}
