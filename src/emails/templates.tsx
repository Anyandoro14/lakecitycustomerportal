// Automated emails render on the LakeCity standard HTML template v4 (shared with the edge functions).
import { renderStandardEmail } from "@shared/domain/email-html.ts";
import type { EmailProps, EmailTemplateKey } from "@shared/domain/emails.ts";

export async function renderEmailHtml(key: EmailTemplateKey, props: EmailProps): Promise<string> {
  return renderStandardEmail(key, props);
}
