import type { ReactNode } from "react";
import UiSection, { Badge } from "../ui/Section";

export default function Section({
  id,
  title,
  description,
  children,
  badge,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <UiSection
      id={id}
      title={title}
      description={description}
      actions={badge ? <Badge>{badge}</Badge> : undefined}
    >
      {children}
    </UiSection>
  );
}
