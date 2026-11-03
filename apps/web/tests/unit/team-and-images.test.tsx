import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AcceptInvitationForm } from "@/components/account/accept-invitation-form";
import { JobView } from "@/components/opportunities/job-view";
import { ImageUpload, MAX_IMAGE_BYTES, mediaUrl, precheck } from "@/components/workspace/image-upload";
import { InviteForm } from "@/components/workspace/invite-form";
import { TeamNameForm } from "@/components/workspace/team-name-form";
import { shareImage, socialFor } from "@/lib/brand";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { buildContent, emptyState, stateFromDraft } from "@/lib/job-editor";
import type { DraftContent, StaffCategory } from "@/lib/staff-types";
import { readRepoFile } from "./helpers";

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:preview"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.values(router).forEach((m) => m.mockClear());
});

function csrfFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/auth/csrf"))
        return new Response(JSON.stringify({ csrf_token: "tok" }), { status: 200 });
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

class FakeXhr {
  static last: FakeXhr;
  static reply: { status: number; body: unknown } = { status: 201, body: {} };
  static progress: number[] = [];
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } =
    {
      onprogress: null,
    };
  headers: Record<string, string> = {};
  method = "";
  url = "";
  sent: FormData | null = null;
  status = 0;
  responseText = "";
  withCredentials = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.onabort?.();
  }
  send(body: FormData) {
    FakeXhr.last = this;
    this.sent = body;
    for (const p of FakeXhr.progress)
      this.upload.onprogress?.({ lengthComputable: true, loaded: p, total: 100 });
    this.status = FakeXhr.reply.status;
    this.responseText =
      typeof FakeXhr.reply.body === "string" ? FakeXhr.reply.body : JSON.stringify(FakeXhr.reply.body);
    queueMicrotask(() => this.onload?.());
  }
}

const file = (name = "pic.jpg", type = "image/jpeg", size = 1000) =>
  new File([new Uint8Array(size)], name, { type });

describe("precheck", () => {
  it("accepts JPEG, PNG and WebP and refuses everything else early", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(precheck({ type, size: 10 })).toBeNull();
    expect(precheck({ type: "image/gif", size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(precheck({ type: "image/svg+xml", size: 10 })).not.toBeNull();
    expect(precheck({ type: "application/pdf", size: 10 })).not.toBeNull();
    expect(precheck({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(/5 MB/);
    expect(precheck({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("the image upload control", () => {
  it("starts empty with a clear call to action, the accepted types and the size limit", () => {
    render(<ImageUpload id="f" value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Upload image" })).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG or WebP, up to 5 MB/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    const input = document.querySelector('input[type="file"]')!;
    expect(input.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp"); // gallery and camera roll on Android
    expect(input).not.toHaveAttribute("capture");
  });

  it("shows the saved image with Replace and Remove, and removal asks first", () => {
    const onChange = vi.fn();
    render(<ImageUpload id="f" value={`listings/${"a".repeat(32)}.jpg`} onChange={onChange} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", mediaUrl(`listings/${"a".repeat(32)}.jpg`));
    expect(screen.getByRole("button", { name: "Replace image" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Remove this image?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("refuses a wrong type or an oversized file before anything is sent", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const onChange = vi.fn();
    render(<ImageUpload id="f" value="" onChange={onChange} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("a.gif", "image/gif")] } });
    expect(await screen.findByText(/Use a JPEG, PNG or WebP image/)).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [file("b.png", "image/png", MAX_IMAGE_BYTES + 1)] } });
    expect(await screen.findByText(/larger than 5 MB/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(FakeXhr.last).toBeUndefined();
  });

  it("uploads with the CSRF header and progress, previews at once, then reports the stored name", async () => {
    csrfFetch(() => new Response("{}"));
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const name = `listings/${"b".repeat(32)}.jpg`;
    FakeXhr.reply = {
      status: 201,
      body: { name, url: `https://upnext.co.zw/media/${name}`, width: 1200, height: 675, bytes: 90000 },
    };
    FakeXhr.progress = [40, 100];
    const onChange = vi.fn();
    render(<ImageUpload id="f" value="" onChange={onChange} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(name));
    expect(FakeXhr.last.url).toBe("/api/v1/staff/media");
    expect(FakeXhr.last.method).toBe("POST");
    expect(FakeXhr.last.headers["X-CSRFToken"]).toBe("tok");
    expect(FakeXhr.last.withCredentials).toBe(true);
    expect((FakeXhr.last.sent as FormData).get("file")).toBeInstanceOf(File);
  });

  it("shows the server's reason when the upload is refused, and keeps the old image", async () => {
    csrfFetch(() => new Response("{}"));
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.progress = [];
    FakeXhr.reply = {
      status: 400,
      body: { error: { code: "not_an_image", message: "That file is not a JPEG, PNG or WebP image." } },
    };
    const onChange = vi.fn();
    render(<ImageUpload id="f" value="" onChange={onChange} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file("fake.jpg")] },
    });
    expect(await screen.findByText(/That file is not a JPEG, PNG or WebP image/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    FakeXhr.reply = { status: 413, body: "" };
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file()] } });
    expect(await screen.findByText(/larger than 5 MB/)).toBeInTheDocument();
    FakeXhr.reply = { status: 429, body: "" };
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file()] } });
    expect(await screen.findByText(/Too many uploads/)).toBeInTheDocument();
  });

  it("accepts a dropped file on desktop", async () => {
    csrfFetch(() => new Response("{}"));
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const name = `listings/${"c".repeat(32)}.jpg`;
    FakeXhr.progress = [];
    FakeXhr.reply = { status: 201, body: { name, url: "x", width: 1, height: 1, bytes: 1 } };
    const onChange = vi.fn();
    const { container } = render(<ImageUpload id="f" value="" onChange={onChange} />);
    const zone = container.querySelector("div[style]")!;
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [file()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(name));
  });

  it("offers a description only for a picture that exists", () => {
    const onAlt = vi.fn();
    const { rerender } = render(
      <ImageUpload id="f" value="" onChange={vi.fn()} alt="" onAltChange={onAlt} />,
    );
    expect(screen.queryByLabelText(/Image description/)).toBeNull();
    rerender(
      <ImageUpload
        id="f"
        value={`listings/${"d".repeat(32)}.jpg`}
        onChange={vi.fn()}
        alt=""
        onAltChange={onAlt}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Image description/), { target: { value: "Our office" } });
    expect(onAlt).toHaveBeenCalledWith("Our office");
  });
});

describe("the job editor carries the images", () => {
  const cat: StaffCategory = { code: "jobs", name: "Jobs", detail_fields: [] };
  const org = { id: "o1", name: "Acme" };
  const name = `listings/${"e".repeat(32)}.jpg`;

  it("sends the picture names with the draft and clears the description when the picture goes", () => {
    const s = {
      ...emptyState("jobs"),
      title: "Accountant",
      organisation: org,
      featuredImage: name,
      featuredAlt: "Our office",
      socialImage: "",
    };
    const { content } = buildContent(s, cat, null, {
      today: "2026-11-01",
      addressLocked: false,
      places: [],
    } as never);
    expect([content.featured_image, content.featured_image_alt, content.social_image]).toEqual([
      name,
      "Our office",
      null,
    ]);
    const gone = buildContent({ ...s, featuredImage: "" }, cat, null, {
      today: "2026-11-01",
      addressLocked: false,
      places: [],
    } as never);
    expect([gone.content.featured_image, gone.content.featured_image_alt]).toEqual([null, null]);
  });

  it("opens a saved draft with its pictures", () => {
    const base = {
      title: "T",
      summary: "",
      description_md: "",
      locations: [],
      sources: [],
      detail: {},
      sector_ids: [],
      skills: [],
      sectors: [],
    } as unknown as DraftContent;
    const s = stateFromDraft(
      { ...base, featured_image: name, featured_image_alt: "Alt", social_image: name },
      cat,
      org,
    );
    expect([s.featuredImage, s.featuredAlt, s.socialImage]).toEqual([name, "Alt", name]);
    const none = stateFromDraft(base, cat, org);
    expect([none.featuredImage, none.featuredAlt, none.socialImage]).toEqual(["", "", ""]);
  });

  it("the editor shows a Featured image section and a Media & SEO sharing image, and the old notice is gone", () => {
    const source = readRepoFile("apps/web/src/components/workspace/job-editor.tsx");
    expect(source).toContain('title="Featured image"');
    expect(source).toContain("Recommended aspect ratio 16:9");
    expect(source).toContain('title="Sharing image"');
    expect(source).not.toContain("cannot be uploaded yet");
  });
});

function listing(over: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: "id-1",
    slug: "accountant-k7m3qp",
    title: "Accountant",
    summary: "Keep the books.",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o1", name: "Acme" },
    locations: [{ slug: "harare", name: "Harare", is_primary: true }],
    work_mode: null,
    employment_type: null,
    deadline: { at: null, timezone: null, is_date_only: false, state: "unknown" },
    salary: null,
    verification: { level: "not_verified", checked_at: null },
    primary_source_name: null,
    status: "published",
    published_at: "2026-10-30T08:00:00Z",
    is_saved: null,
    description_html: "<ul><li>Books</li></ul>",
    requirements_html: null,
    geographic_eligibility: null,
    location_text: null,
    experience_level: null,
    funding: null,
    skills: [],
    sectors: [],
    reference_number: null,
    contact_details: null,
    application: {
      method: "instructions",
      url: null,
      email: null,
      email_subject: null,
      instructions: "Ask.",
    },
    sources: [],
    detail: {},
    detail_schema_version: 1,
    canonical_path: "/opportunities/accountant-k7m3qp",
    updated_at: "2026-10-30T08:00:00Z",
    ...over,
  };
}

describe("public pages and previews", () => {
  it("shows the featured image with its description, and nothing invented without one", () => {
    const image = { featured: "https://upnext.co.zw/media/listings/x.jpg", social: null, alt: "Our office" };
    const { rerender } = render(<JobView listing={listing({ image })} />);
    const shown = screen.getByRole("img", { name: "Our office" });
    expect(shown).toHaveAttribute("src", image.featured);
    expect(screen.getByText("Not verified")).toBeInTheDocument(); // a picture proves nothing
    rerender(<JobView listing={listing({ image: null })} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("uses the sharing image for link previews, only as an absolute https address", () => {
    const https = "https://upnext.co.zw/media/listings/s.jpg";
    expect(shareImage({ featured: "https://upnext.co.zw/f.jpg", social: https, alt: "A" })).toEqual({
      url: https,
      alt: "A",
    });
    expect(shareImage({ featured: "https://upnext.co.zw/f.jpg", social: null, alt: null })?.url).toBe(
      "https://upnext.co.zw/f.jpg",
    );
    expect(shareImage({ featured: "http://insecure.example/f.jpg", social: null, alt: null })).toBeNull();
    expect(shareImage({ featured: "/media/relative.jpg", social: null, alt: null })).toBeNull();
    expect(shareImage(null)).toBeNull();
    const card = socialFor("/opportunities/x", { title: "T", description: "D", image: { url: https } });
    expect(card.openGraph.images[0]).toMatchObject({ url: https });
    expect(card.twitter.card).toBe("summary_large_image");
    expect(card.twitter.images).toEqual([https]);
    const plain = socialFor("/opportunities/x", { title: "T" });
    expect(String(plain.openGraph.images[0]?.url)).toContain("/brand/og-image.png"); // the standard UPNEXT image
  });

  it("allows the upload preview in the page security policy and keeps everything else closed", () => {
    const proxy = readRepoFile("apps/web/src/proxy.ts");
    expect(proxy).toMatch(/img-src 'self' data: blob:/);
    expect(proxy).toContain("default-src 'self'");
  });
});

describe("staff management forms", () => {
  const roles = [
    { value: "administrator", label: "Administrator", summary: "Manages staff." },
    { value: "editor", label: "Editor", summary: "Publishes listings." },
    { value: "contributor", label: "Contributor", summary: "Drafts listings." },
  ];

  it("invites with name, email and an existing role, and never asks for a password", async () => {
    const calls = csrfFetch(
      () => new Response(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111" }), { status: 201 }),
    );
    render(<InviteForm roles={roles} />);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole("option", { name: /publisher/i })).toBeNull();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Rudo Moyo" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "rudo@example.org" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "editor" } });
    expect(screen.getByText("Publishes listings.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/workspace/team/11111111-1111-1111-1111-111111111111?invited=1",
      ),
    );
    expect(calls[0]!.url).toBe("/api/v1/staff/team");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      display_name: "Rudo Moyo",
      email: "rudo@example.org",
      role: "editor",
    });
  });

  it("shows the server's field errors, such as an address that already has an account", async () => {
    csrfFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "validation_failed",
              message: "Check the details.",
              fields: { email: [{ message: "That e-mail address already has an account." }] },
            },
          }),
          { status: 400 },
        ),
    );
    render(<InviteForm roles={roles} />);
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/already has an account/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("edits only the name", async () => {
    const calls = csrfFetch(() => new Response("{}", { status: 200 }));
    render(<TeamNameForm id="abc" name="Old Name" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(calls[0]!.url).toBe("/api/v1/staff/team/abc");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ display_name: "New Name" });
  });
});

describe("accepting an invitation", () => {
  it("explains a missing or used link without revealing anything", () => {
    render(<AcceptInvitationForm token={null} />);
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("needs two matching passwords before it sends anything", async () => {
    const calls = csrfFetch(() => new Response(null, { status: 204 }));
    render(<AcceptInvitationForm token="tok.en" />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a long unguessable phrase 12" },
    });
    fireEvent.change(screen.getByLabelText("Repeat the password"), {
      target: { value: "something else entirely 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(/do not match/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("sends the token and the chosen password once, then points to sign-in", async () => {
    const calls = csrfFetch(() => new Response(null, { status: 204 }));
    render(<AcceptInvitationForm token="tok.en" />);
    for (const label of ["Password", "Repeat the password"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "a long unguessable phrase 12" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("Your account is ready")).toBeInTheDocument();
    expect(calls[0]!.url).toBe("/api/v1/auth/staff-invitation/accept");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      token: "tok.en",
      password: "a long unguessable phrase 12",
    });
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fworkspace",
    );
  });

  it("treats a rejected link as invalid", async () => {
    csrfFetch(
      () => new Response(JSON.stringify({ error: { code: "invalid_token", message: "x" } }), { status: 400 }),
    );
    render(<AcceptInvitationForm token="used.up" />);
    for (const label of ["Password", "Repeat the password"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "a long unguessable phrase 12" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });
});

describe("the staff pages", () => {
  it("add Staff management to the navigation for Administrators only", () => {
    const chrome = readRepoFile("apps/web/src/components/workspace/chrome.tsx");
    expect(chrome).toMatch(/has\("user\.status\.change"\)[\s\S]{0,200}Staff management/);
    const page = readRepoFile("apps/web/src/app/workspace/(shell)/team/page.tsx");
    expect(page).toContain('can(session, "user.status.change")');
    for (const word of [
      "Total staff",
      "Active",
      "Suspended",
      "Pending invitations",
      "Last login",
      "Date joined",
      "Actions",
    ])
      expect(page).toContain(word);
  });

  it("have loading states for the list, the form and the profile", () => {
    for (const dir of ["team", "team/new", "team/[id]"])
      expect(readRepoFile(`apps/web/src/app/workspace/(shell)/${dir}/loading.tsx`)).toContain("Loading");
  });
});
