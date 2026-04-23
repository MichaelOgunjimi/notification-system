export default function DocsContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="min-w-0 flex-1">
      {children}
    </main>
  );
}
