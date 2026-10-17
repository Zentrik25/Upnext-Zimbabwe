import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account/forgot-password-form";
import { FormPage } from "@/components/account/parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <FormPage title="Reset your password" intro="Enter your e-mail address and we will send you a link.">
      <ForgotPasswordForm />
    </FormPage>
  );
}
