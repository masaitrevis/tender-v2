/** Slim footer strip pinned at the bottom of the content region. */
export default function Footer() {
  return (
    <footer className="flex items-center justify-between border-t border-app-border bg-white px-7 py-3 text-xs text-app-muted">
      <span>© 2026 Future Bright Ventures Ltd · Tender &amp; Contract Management System</span>
      <span className="font-mono text-[11px]">v2.0 · demo build · data stored locally</span>
    </footer>
  );
}
