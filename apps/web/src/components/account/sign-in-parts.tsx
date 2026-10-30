import Link from "next/link";
import { FormError } from "./parts";

/** Static pieces of the sign-in form. Rendered by the page (a server component) and passed to the form, so they
 *  stay out of its client bundle, which the mobile script budget (150 KiB) measures. */
export function SignInOptions() {
  return (
    <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-4 text-ctl">
      <label htmlFor="remember" className="inline-flex min-h-[44px] items-center gap-3 text-check-text">
        <input id="remember" name="remember" type="checkbox" className="accent-accent" />
        Remember me
      </label>
      <Link href="/forgot-password" className="inline-flex min-h-[44px] items-center text-accent">
        Forgot your password?
      </Link>
    </div>
  );
}

export function GoogleFailedNotice() {
  return (
    <FormError>Google sign-in did not work. Try again, or sign in with your e-mail and password.</FormError>
  );
}

export function CreateAccountPrompt() {
  return (
    <p className="text-center text-ctl">
      Don’t have an account?{" "}
      <Link href="/register" className="text-accent underline">
        Create an account
      </Link>
    </p>
  );
}
