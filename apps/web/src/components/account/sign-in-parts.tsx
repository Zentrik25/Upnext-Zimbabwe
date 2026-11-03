import Link from "next/link";
import { AuthSwitch } from "./auth-parts";
import { FormError } from "./parts";

/** Static pieces of the sign-in form. Rendered by the page (a server component) and passed to the form, so they
 *  stay out of its client bundle, which the mobile script budget (150 KiB) measures. */
export function SignInOptions() {
  return (
    <label
      htmlFor="remember"
      className="inline-flex min-h-[28px] items-center gap-2.5 text-ctl text-check-text"
    >
      <input id="remember" name="remember" type="checkbox" className="accent-accent" />
      Remember me
    </label>
  );
}

export function GoogleFailedNotice() {
  return (
    <FormError>Google sign-in did not work. Try again, or sign in with your e-mail and password.</FormError>
  );
}

export function CreateAccountPrompt() {
  return (
    <AuthSwitch>
      New to UPNEXT? <Link href="/register">Create account</Link>
    </AuthSwitch>
  );
}
