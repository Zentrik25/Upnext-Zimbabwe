import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { ButtonLink } from "@/components/ui";
import { socialFor } from "@/lib/brand";

const DESCRIPTION =
  "Post jobs, internships and graduate programmes on UPNEXT Careers. Organisations are verified and every listing is reviewed by an editor before it is public.";
export const metadata: Metadata = {
  title: "For Employers", // priority destination 7 (D-69); the page heading stays in sentence case
  description: DESCRIPTION,
  alternates: { canonical: "/employers" },
  ...socialFor("/employers", { title: "For Employers", description: DESCRIPTION }),
};

const STEPS: { title: string; text: string }[] = [
  {
    title: "Create an account",
    text: "Use your work e-mail address and confirm it.",
  },
  {
    title: "Claim your organisation",
    text: "You say who you are and how we can confirm it. An editor checks by hand; we record how the organisation was verified.",
  },
  {
    title: "Post and manage listings",
    text: "Jobs, internships and graduate programmes. Save drafts, submit when ready, and change a published listing by starting an amendment.",
  },
  {
    title: "An editor reviews each listing",
    text: "It is published only after a different person approves it. You see the reasons if it is sent back.",
  },
  {
    title: "See how it is doing",
    text: "Your dashboard shows views, clicks on the apply link and how many people saved the listing.",
  },
];

const LIMITS = [
  "We never receive or track applications. Applicants go to your website, e-mail address or instructions.",
  "We do not accept payment from applicants or let listings ask applicants to pay.",
  "A verified organisation does not make a listing verified. Listing labels stay separate and are set by editors.",
  "We cannot promise how quickly an editor will respond.",
];

export default function EmployersPage() {
  return (
    <>
      <section className="bg-surface-pale">
        <Container className="py-14 max-sm:py-8">
          <h1 className="m-0 max-w-[20ch] text-display font-strong tracking-display">For employers</h1>
          <p className="mt-4 max-w-[56ch] text-lead text-muted">
            Reach people looking for work in Zimbabwe. Every organisation is verified and every listing is
            reviewed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/employers/register" className="rounded-pill px-6">
              Create an employer account
            </ButtonLink>
            <ButtonLink href="/employer" variant="secondary" className="rounded-pill px-6">
              Go to your dashboard
            </ButtonLink>
          </div>
        </Container>
      </section>
      <Container className="py-10 max-sm:py-6">
        <section aria-labelledby="how-title">
          <h2 id="how-title" className="m-0 text-sub font-strong tracking-sub">
            How it works
          </h2>
          <ol className="m-0 mt-5 grid list-none grid-cols-3 gap-4 p-0 max-md:grid-cols-2 max-sm:grid-cols-1">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-card border border-line bg-surface p-5">
                <span aria-hidden="true" className="text-ctl font-strong text-link">
                  {index + 1}
                </span>
                <h3 className="m-0 mt-1 text-title font-strong">{step.title}</h3>
                <p className="mt-2 text-ctl text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          aria-labelledby="limits-title"
          className="mt-10 rounded-feature bg-surface-pale p-8 max-sm:p-5"
        >
          <h2 id="limits-title" className="m-0 text-sub font-strong tracking-sub">
            What we do not do
          </h2>
          <ul className="m-0 mt-4 grid max-w-[70ch] list-disc gap-2 pl-5 text-base">
            {LIMITS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="q-title" className="mt-10">
          <h2 id="q-title" className="m-0 text-sub font-strong tracking-sub">
            Questions
          </h2>
          <p className="mt-3 text-base">
            See the <Link href="/contact">contact page</Link> and the{" "}
            <Link href="/privacy">privacy notice</Link> (a draft awaiting owner and legal review).
          </p>
        </section>
      </Container>
    </>
  );
}
