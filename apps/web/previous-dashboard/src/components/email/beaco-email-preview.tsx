import Image from "next/image";
import type { EmailTemplate } from "@/lib/email-templates";

export type EmailColorScheme = "light" | "dark";

type BeacoEmailPreviewProps = {
  template: EmailTemplate;
  colorScheme: EmailColorScheme;
};

export function BeacoEmailPreview({ template, colorScheme }: BeacoEmailPreviewProps) {
  const isInvite = template.id === "organization-invitation";
  const isWelcome = template.id === "account-ready";
  const headline = isInvite
    ? `A seat is waiting at ${template.sample.organization}`
    : isWelcome
      ? "Your notification workspace is live"
      : "Your private route into Beaco";
  const intro = isInvite
    ? `${template.sample.inviter} invited you to join ${template.sample.organization} and work from one shared notification record.`
    : isWelcome
      ? `Hi ${template.sample.recipientName}, your organization and first project are ready. The control plane is yours.`
      : `Hi ${template.sample.recipientName}, use this one-time link to securely sign in. No password, no credentials left behind.`;
  const eyebrow = isInvite ? "Organization invitation" : isWelcome ? "Workspace provisioned" : "Secure account access";
  const detailLabel = isInvite ? "Organization" : isWelcome ? "First project" : "Valid for";
  const detailValue = isInvite ? template.sample.organization : isWelcome ? "Default" : template.sample.expiry;

  return (
    <article
      data-color-scheme={colorScheme}
      className="group/email mx-auto w-full max-w-[640px] overflow-hidden rounded-[2px] border border-[#d9d4c8] bg-[#f7f4eb] text-[#211f1a] shadow-[0_30px_90px_rgba(0,0,0,0.28)] transition-colors data-[color-scheme=dark]:border-[#34332e] data-[color-scheme=dark]:bg-[#11110f] data-[color-scheme=dark]:text-[#f2eee4]"
      aria-label={`${template.name} email preview in ${colorScheme} mode`}
    >
      <header className="border-b-2 border-[#e9aa31] bg-[#11110f] px-6 py-6 sm:px-10 sm:py-7">
        <div className="flex items-center justify-between gap-6">
          <Image
            src="/brand/png/beaco-lockup-horizontal-dark.png"
            width={220}
            height={72}
            alt="Beaco"
            className="h-auto w-[118px] sm:w-[132px]"
            priority
          />
          <span className="text-right font-mono text-[9px] uppercase tracking-[0.16em] text-white/48">Identity message / {template.id.replaceAll("-", " ")}</span>
        </div>
      </header>

      <div className="px-6 py-9 sm:px-10 sm:py-12">
        <div className="flex items-center gap-3">
          <span className="size-2 bg-[#e9aa31] shadow-[0_0_16px_rgba(233,170,49,.55)]" />
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8274] group-data-[color-scheme=dark]/email:text-[#9c968b]">{eyebrow}</p>
        </div>

        <h1 className="mt-7 max-w-[15ch] text-[34px] font-semibold leading-[1.02] tracking-[-0.052em] sm:text-[44px]">{headline}</h1>
        <p className="mt-6 max-w-[32rem] text-[14px] leading-7 text-[#5f5a50] group-data-[color-scheme=dark]/email:text-[#b4aea2]">{intro}</p>

        <dl className="mt-9 grid grid-cols-1 border-y border-[#ded9cc] sm:grid-cols-2 group-data-[color-scheme=dark]/email:border-[#37362f]">
          <div className="py-5 sm:pr-6">
            <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8274] group-data-[color-scheme=dark]/email:text-[#827d73]">{detailLabel}</dt>
            <dd className="mt-2 text-[14px] font-semibold">{detailValue}</dd>
          </div>
          <div className="border-t border-[#ded9cc] py-5 sm:border-l sm:border-t-0 sm:pl-6 group-data-[color-scheme=dark]/email:border-[#37362f]">
            <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8274] group-data-[color-scheme=dark]/email:text-[#827d73]">Security</dt>
            <dd className="mt-2 text-[14px] font-semibold">{isWelcome ? "Account verified" : "Single-use access"}</dd>
          </div>
        </dl>

        <a
          href={template.action.destination}
          className="mt-9 inline-flex min-h-12 items-center justify-center bg-[#e9aa31] px-6 text-[12px] font-bold tracking-[-0.01em] text-[#1d160b] no-underline"
        >
          {template.action.label}<span className="ml-4 font-mono" aria-hidden="true">→</span>
        </a>

        <p className="mt-7 text-[11px] leading-5 text-[#7c7569] group-data-[color-scheme=dark]/email:text-[#8f897e]">
          {isInvite
            ? `This invitation expires in ${template.sample.expiry}.`
            : isWelcome
              ? "This confirms that account provisioning completed successfully."
              : `This link expires in ${template.sample.expiry} and can only be used once.`}
          {isWelcome ? "" : " If you did not request this, no action is required."}
        </p>

        {!isWelcome ? (
          <div className="mt-7 border-l-2 border-[#e9aa31] bg-[#eeeadf] px-4 py-3 group-data-[color-scheme=dark]/email:bg-[#191916]">
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#777064] group-data-[color-scheme=dark]/email:text-[#8e887d]">Button not working?</p>
            <p className="mt-2 break-all font-mono text-[9px] leading-4 text-[#514d45] group-data-[color-scheme=dark]/email:text-[#aba59a]">https://beaco.app{template.action.destination}</p>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-[#ddd7ca] bg-[#ebe7dc] px-6 py-7 group-data-[color-scheme=dark]/email:border-[#34332e] group-data-[color-scheme=dark]/email:bg-[#0b0b0a] sm:px-10">
        <div className="flex items-start gap-4">
          <Image
            src={colorScheme === "light" ? "/brand/png/beaco-mark-on-light.png" : "/brand/png/beaco-mark-128.png"}
            width={38}
            height={38}
            alt=""
            className="size-9 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <strong className="text-[13px] tracking-[-0.02em]">Beaco</strong>
            <p className="mt-1 text-[10px] leading-4 text-[#777064] group-data-[color-scheme=dark]/email:text-[#8d877d]">Notification infrastructure with an accountable delivery record.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#d7d1c4] pt-5 font-mono text-[9px] text-[#777064] group-data-[color-scheme=dark]/email:border-[#302f2a] group-data-[color-scheme=dark]/email:text-[#807b72]">
          <span>Docs</span><span aria-hidden="true">·</span><span>Security</span><span aria-hidden="true">·</span><span>Privacy</span><span className="ml-auto">Sent to {template.sample.email}</span>
        </div>
      </footer>
    </article>
  );
}
