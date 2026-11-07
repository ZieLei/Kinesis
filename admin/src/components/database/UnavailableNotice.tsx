import type { ReactNode } from "react";
import Notice from "../ui/Notice";

export default function UnavailableNotice({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Notice tone="warning" role="note">
      {children}
    </Notice>
  );
}
