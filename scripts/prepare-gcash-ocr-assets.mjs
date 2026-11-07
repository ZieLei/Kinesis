import { access, cp, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const publicRoot = join(projectRoot, "public", "tesseract");

async function findPackageRoot(packageName) {
  const resolvedEntry = require.resolve(packageName);
  let current = dirname(resolvedEntry);

  while (true) {
    try {
      await access(join(current, "package.json"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error(`Could not locate the package root for ${packageName}.`);
      }
      current = parent;
    }
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const tesseractRoot = await findPackageRoot("tesseract.js");
  const coreRoot = await findPackageRoot("tesseract.js-core");
  const englishRoot = await findPackageRoot("@tesseract.js-data/eng");

  const workerSource = join(tesseractRoot, "dist", "worker.min.js");
  const bestEnglishModel = join(
    englishRoot,
    "4.0.0_best_int",
    "eng.traineddata.gz",
  );
  const standardEnglishModel = join(
    englishRoot,
    "4.0.0",
    "eng.traineddata.gz",
  );
  const englishModel = (await exists(bestEnglishModel))
    ? bestEnglishModel
    : standardEnglishModel;

  if (!(await exists(workerSource))) {
    throw new Error(`Tesseract worker not found: ${workerSource}`);
  }
  if (!(await exists(englishModel))) {
    throw new Error(`English OCR model not found under: ${englishRoot}`);
  }

  await rm(publicRoot, { recursive: true, force: true });
  await mkdir(join(publicRoot, "core"), { recursive: true });
  await mkdir(join(publicRoot, "lang"), { recursive: true });

  await copyFile(workerSource, join(publicRoot, "worker.min.js"));
  await cp(coreRoot, join(publicRoot, "core"), { recursive: true });
  await copyFile(englishModel, join(publicRoot, "lang", "eng.traineddata.gz"));

  const copiedCoreFiles = await readdir(join(publicRoot, "core"));
  const wasmLoaders = copiedCoreFiles.filter(
    (filename) => filename.startsWith("tesseract-core") && filename.endsWith(".wasm.js"),
  );

  if (wasmLoaders.length === 0) {
    throw new Error(
      "No Tesseract WASM loader files were copied. Check the installed tesseract.js-core package layout.",
    );
  }

  console.log(`Prepared browser OCR assets in ${resolve(publicRoot)}`);
  console.log(`Copied ${wasmLoaders.length} Tesseract WASM loader files.`);
  console.log("English language data is bundled locally for offline browser OCR.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
