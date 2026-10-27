import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../types/settings";
import PosContent from "./sections/PosContent";
import InventoryContent from "./sections/InventoryContent";
import ReceiptsContent from "./sections/ReceiptsContent";
import PermissionsContent from "./sections/PermissionsContent";
import ServerContent from "./sections/ServerContent";
import BackupsContent from "./sections/BackupsContent";
import DiagnosticsContent from "./sections/DiagnosticsContent";
import SecurityContent from "./sections/SecurityContent";

export default function SectionContent({
  section,
  settings,
  onUpdate,
  currencyPreview,
  skuPreview,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
  currencyPreview: string;
  skuPreview: string;
}) {
  switch (section.id) {
    case "pos":
      return (
        <PosContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
          currencyPreview={currencyPreview}
        />
      );
    case "inventory":
      return (
        <InventoryContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
          skuPreview={skuPreview}
        />
      );
    case "receipts":
      return (
        <ReceiptsContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
          currencyPreview={currencyPreview}
        />
      );
    case "permissions":
      return (
        <PermissionsContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
        />
      );
    case "server":
      return (
        <ServerContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
        />
      );
    case "backups":
      return (
        <BackupsContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
        />
      );
    case "diagnostics":
      return (
        <DiagnosticsContent
          section={section}
          settings={settings}
          onUpdate={onUpdate}
        />
      );
    case "security":
      return <SecurityContent />;
    default:
      return null;
  }
}
