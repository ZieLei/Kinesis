import type {
  SectionDefinition,
  SettingsApiResponse,
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

export default function SectionContent({
  section,
  settings,
  onUpdate,
  currencyPreview,
  skuPreview,
  version,
  isUploadingGcashQr,
  gcashQrError,
  gcashQrNotice,
  onUploadGcashQr,
  onRemoveGcashQr,
  onGcashAccountsChanged,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
  currencyPreview: string;
  skuPreview: string;
  version: number | null;
  isUploadingGcashQr: boolean;
  gcashQrError: string;
  gcashQrNotice: string;
  onUploadGcashQr: (file: File) => Promise<void>;
  onRemoveGcashQr: () => Promise<void>;
  onGcashAccountsChanged: (response: SettingsApiResponse) => void;
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
          version={version}
          isUploadingGcashQr={isUploadingGcashQr}
          gcashQrError={gcashQrError}
          gcashQrNotice={gcashQrNotice}
          onUploadGcashQr={onUploadGcashQr}
          onRemoveGcashQr={onRemoveGcashQr}
          onGcashAccountsChanged={onGcashAccountsChanged}
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

    default:
      return null;
  }
}
