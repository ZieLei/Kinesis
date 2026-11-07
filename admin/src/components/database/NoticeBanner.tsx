import Notice from "../ui/Notice";

export default function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: string;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  return (
    <Notice tone="info" role="status" onDismiss={onDismiss}>
      {notice}
    </Notice>
  );
}
