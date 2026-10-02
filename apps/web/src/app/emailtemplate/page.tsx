import type { Metadata } from "next";
import { EmailTemplateGallery } from "@/components/email/email-template-gallery";
import { assertEmailCatalogue } from "@/lib/email-templates";

export const metadata: Metadata = {
  title: "Email template review | Beaco",
  robots: { index: false, follow: false },
};

/**
 * Renders the unlinked, review-only email template gallery.
 *
 * @returns The interactive gallery after validating its static catalogue.
 */
export default function EmailTemplatePage() {
  assertEmailCatalogue();
  return <EmailTemplateGallery />;
}
