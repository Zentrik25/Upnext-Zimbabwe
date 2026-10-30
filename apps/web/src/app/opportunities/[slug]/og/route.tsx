import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { BRAND } from "@/lib/brand";
import { getOpportunity } from "@/lib/catalog";
import tokens from "@/design/tokens.json";
import { cardFor } from "@/lib/listing-card";
import { absolute } from "@/lib/site";

export const dynamic = "force-dynamic";

const color = (name: keyof typeof tokens.colors): string => {
  const token = tokens.colors[name] as { ref: string; prod?: string };
  return token.prod ?? token.ref;
};
const INK = color("ink");
const ACCENT = color("accent");
const MUTED = color("muted");
const LINE = color("line");

// Read with a literal path under process.cwd() so Next's file tracing copies the files into the standalone build.
const font = (file: "inter-latin-400.ttf" | "inter-latin-700.ttf") =>
  readFile(join(process.cwd(), "src/fonts", file));
const lockup = async () =>
  `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), "public/brand/upnext-lockup.svg"))).toString("base64")}`;

/**
 * The preview card for one listing, used as its Open Graph and Twitter image. There is no listing image or
 * organisation logo in the data yet, so the card is generated from the listing's own words (organisation mark,
 * category, title, organisation, where, what kind, deadline) in the site's design. An unknown or non-public listing
 * has no card (404); if the service cannot be reached the shared site image is served instead, so a link is never
 * left without a preview.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok) return NextResponse.redirect(absolute(BRAND.assets.ogImage), 307);
  if (result.data === null) return new NextResponse("Not found", { status: 404 });

  const card = cardFor(result.data);
  const [bold, regular, logo] = await Promise.all([
    font("inter-latin-700.ttf"),
    font("inter-latin-400.ttf"),
    lockup(),
  ]);
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        fontFamily: "Inter",
        color: INK,
        padding: "56px 72px 0 72px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 6,
            background: color("avatar-bg"),
            border: `2px solid ${LINE}`,
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          {card.initials}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: ACCENT,
            }}
          >
            {card.category}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 6 }}>{card.organisation}</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          fontSize: card.titleSize,
          fontWeight: 700,
          lineHeight: 1.12,
          letterSpacing: -2,
        }}
      >
        {card.title}
      </div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED, marginBottom: 28 }}>
        {card.facts.join("  ·  ")}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid ${LINE}`,
          height: 96,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a picture on the server, not a page */}
        <img src={logo} width={268} height={48} alt="" />
        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>{BRAND.domain}</div>
      </div>
      <div style={{ display: "flex", height: 10, background: ACCENT, margin: "0 -72px" }} />
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ],
      // The listing can be withdrawn or corrected: an hour in shared caches, not a year.
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
