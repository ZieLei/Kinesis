export default function SecurityContent() {
  return (
    <ul className="space-y-3 text-xs leading-relaxed text-ctp-subtext0">
      <li className="flex gap-2">
        <span className="text-ctp-mauve">•</span>
        <span>Validate settings on the backend and enforce critical policies during transactions.</span>
      </li>
      <li className="flex gap-2">
        <span className="text-ctp-mauve">•</span>
        <span>Never store supervisor PINs or credentials as plaintext settings.</span>
      </li>
      <li className="flex gap-2">
        <span className="text-ctp-mauve">•</span>
        <span>Use idempotent transaction IDs and conflict handling for offline queues.</span>
      </li>
      <li className="flex gap-2">
        <span className="text-ctp-mauve">•</span>
        <span>Audit server-side configuration changes. Apply sensitive network changes through a controlled restart.</span>
      </li>
    </ul>
  );
}
