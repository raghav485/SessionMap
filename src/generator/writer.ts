import fs from "node:fs/promises";
import path from "node:path";

import { GENERATED_MODULES_DIR_NAME, SESSIONMAP_DIR_NAME } from "../constants.js";

async function writeAtomicFile(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${contents}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function writeGeneratedArtifacts(
  projectRoot: string,
  artifacts: Record<string, string>
): Promise<string[]> {
  await fs.mkdir(path.join(projectRoot, SESSIONMAP_DIR_NAME), { recursive: true });
  await fs.mkdir(path.join(projectRoot, GENERATED_MODULES_DIR_NAME), { recursive: true });

  const generatedFiles = Object.keys(artifacts).sort((left, right) => left.localeCompare(right));
  for (const relativeArtifactPath of generatedFiles) {
    await writeAtomicFile(path.join(projectRoot, SESSIONMAP_DIR_NAME, relativeArtifactPath), artifacts[relativeArtifactPath]);
  }

  return generatedFiles.map((relativeArtifactPath) => `${SESSIONMAP_DIR_NAME}/${relativeArtifactPath}`);
}
