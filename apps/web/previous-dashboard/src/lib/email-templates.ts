export type EmailTemplateStatus = "integrated" | "proposed";

export type EmailTemplate = {
  id: string;
  category: "Account access" | "Organizations";
  name: string;
  audience: string;
  subject: string;
  trigger: string;
  variables: string[];
  action: { label: string; destination: string };
  status: EmailTemplateStatus;
  sample: { recipientName: string; email: string; organization?: string; inviter?: string; expiry: string };
};

export const emailTemplates: EmailTemplate[] = [
  {
    id: "magic-link-sign-in",
    category: "Account access",
    name: "Private sign-in link",
    audience: "New or returning user",
    subject: "Your private link to Beaco",
    trigger: "POST /auth/magic-link/request",
    variables: ["recipient_name", "magic_link_url", "expires_in_minutes"],
    action: { label: "Sign in to Beaco", destination: "/auth/magic-link?token={{ token }}" },
    status: "integrated",
    sample: { recipientName: "Maya", email: "maya@northstar.dev", expiry: "15 minutes" },
  },
  {
    id: "account-ready",
    category: "Account access",
    name: "Account ready",
    audience: "Newly created user",
    subject: "Your Beaco workspace is ready",
    trigger: "First successful magic-link or GitHub registration",
    variables: ["recipient_name", "organization_name", "project_name", "dashboard_url"],
    action: { label: "Open your workspace", destination: "/auth/complete" },
    status: "proposed",
    sample: { recipientName: "Maya", email: "maya@northstar.dev", organization: "Northstar", expiry: "—" },
  },
  {
    id: "organization-invitation",
    category: "Organizations",
    name: "Organization invitation",
    audience: "Invited organization member",
    subject: "Join Northstar on Beaco",
    trigger: "POST /organizations/{organization_id}/invitations",
    variables: ["recipient_email", "inviter_name", "organization_name", "role", "invitation_url", "expires_in_days"],
    action: { label: "Review invitation", destination: "/invitations/accept?token={{ token }}" },
    status: "integrated",
    sample: { recipientName: "Maya", email: "maya@northstar.dev", organization: "Northstar", inviter: "Jon Bell", expiry: "7 days" },
  },
];

export function assertEmailCatalogue(): void {
  const ids = new Set(emailTemplates.map((template) => template.id));
  if (ids.size !== emailTemplates.length) throw new Error("Email template IDs must be unique.");
  for (const template of emailTemplates) {
    if (!template.variables.length || !template.action.destination.startsWith("/")) {
      throw new Error(`Email template ${template.id} has incomplete review metadata.`);
    }
  }
}
