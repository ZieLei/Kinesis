/**
 * Platform entry point: Metro resolves documentExport.web.ts on web and
 * documentExport.native.ts on iOS/Android. This file only satisfies
 * TypeScript, which does not know the platform suffixes.
 */
export { exportCsv, exportPdf } from "./documentExport.native";
