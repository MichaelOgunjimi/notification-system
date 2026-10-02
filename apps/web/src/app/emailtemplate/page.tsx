import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmailTemplateGallery } from "@/components/email/email-template-gallery";
import { assertEmailCatalogue } from "@/lib/email-templates";

export const metadata: Metadata = {
  title: "Email template review | Beaco",
  robots: { index: false, follow: false },
};

/**
 * Renders the unlinked, review-only email template gallery.
 *
 * Returns a 404 in production; otherwise renders the gallery after validating its catalogue.
 *
 * @returns The interactive development-only gallery.
 */
export default function EmailTemplatePage() {
  if (process.env.NODE_ENV === "production") notFound();

  assertEmailCatalogue();
  return <EmailTemplateGallery />;
}
