export default function SecurityFooter() {
  return (
    <footer className="border-t border-ctp-surface0 pt-4">
      <h3 className="text-xs font-medium text-ctp-subtext1">
        Database security
      </h3>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ctp-subtext0">
        Require administrator authentication for database operations.
        Restrict SQL permissions, use parameterized queries where
        applicable, enforce timeouts, and audit destructive actions. Never
        expose database credentials or unrestricted SQL execution to clients.
      </p>
    </footer>
  );
}
