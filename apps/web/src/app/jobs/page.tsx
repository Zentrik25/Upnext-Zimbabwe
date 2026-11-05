import { permanentRedirect } from "next/navigation";

/** `/jobs` on its own (someone shortening a landing-page address) is the jobs category list. */
export default function JobsIndex(): never {
  permanentRedirect("/opportunities?category=jobs");
}
