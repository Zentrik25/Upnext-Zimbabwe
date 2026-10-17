import { execSync } from "node:child_process";

/**
 * Browser tests read spooled e-mail and demo two-step codes by running Django management commands in the
 * `worker` container of the throwaway test stack (E2E_EXEC, for example
 * `docker compose -p upnext-dev -f infrastructure/compose/compose.yaml exec -T worker python manage.py`).
 */
export function manage(args: string): string {
  const prefix = process.env.E2E_EXEC;
  if (!prefix) throw new Error("E2E_EXEC is not set");
  return execSync(`${prefix} ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export async function lastEmail(to: string, kind: string): Promise<{ subject: string; body: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return JSON.parse(manage(`last_email --to ${to} --kind ${kind}`)) as { subject: string; body: string };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // the worker sends within a few seconds
    }
  }
  throw new Error(`no ${kind} e-mail arrived for ${to}`);
}

export const linkIn = (body: string): string => {
  const match = /(https?:\/\/\S+)/.exec(body);
  if (!match) throw new Error("no link in e-mail");
  return match[1]!;
};

export const demoCode = (email: string): string => manage(`demo_totp_code --email ${email}`);
