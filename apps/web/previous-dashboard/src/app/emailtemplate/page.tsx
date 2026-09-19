import type { Metadata } from "next";
import { EmailTemplateGallery } from "@/components/email/email-template-gallery";
import { assertEmailCatalogue } from "@/lib/email-templates";

export const metadata: Metadata = {
  title: "Email template review | Beaco",
  robots: { index: false, follow: false },
};

export default function EmailTemplatePage() {
  assertEmailCatalogue();
  return <EmailTemplateGallery />;
}
