export type * from "@shared/domain/types.ts";
import type { EmailProps, EmailTemplateKey } from "@shared/domain/emails.ts";

export interface OutboxEmailRecord {
  id: string;
  leadId: string;
  template: EmailTemplateKey;
  to: string;
  subject: string;
  props: EmailProps;
  attachmentNames: string[];
  status: "queued_dev_only";
  createdAt: string;
}
