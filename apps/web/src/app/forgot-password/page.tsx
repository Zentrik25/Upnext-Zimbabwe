import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account/forgot-password-form";
import { AuthPage } from "@/components/account/auth-parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthPage title="Reset your password">
      <ForgotPasswordForm />
    </AuthPage>
  );
}
