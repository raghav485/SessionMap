import path from "node:path";

import { JAVA_SCRIPT_EXTENSIONS, TYPE_SCRIPT_EXTENSIONS } from "../constants.js";
import type { LanguageTier } from "../types.js";

export interface DetectedLanguage {
  language: string;
  tier: LanguageTier;
}

export function detectLanguage(relativePath: string): DetectedLanguage {
  const extension = path.extname(relativePath).toLowerCase();

  if (TYPE_SCRIPT_EXTENSIONS.has(extension)) {
    return { language: "typescript", tier: 1 };
  }

  if (JAVA_SCRIPT_EXTENSIONS.has(extension)) {
    return { language: "javascript", tier: 1 };
  }

  const mapping: Record<string, DetectedLanguage> = {
    ".py": { language: "python", tier: 2 },
    ".go": { language: "go", tier: 2 },
    ".rs": { language: "rust", tier: 2 },
    ".java": { language: "java", tier: 2 },
    ".cs": { language: "csharp", tier: 2 },
    ".rb": { language: "ruby", tier: 2 },
    ".php": { language: "php", tier: 2 },
    ".json": { language: "json", tier: 3 },
    ".md": { language: "markdown", tier: 3 },
    ".yml": { language: "yaml", tier: 3 },
    ".yaml": { language: "yaml", tier: 3 }
  };

  return mapping[extension] ?? { language: "unknown", tier: 3 };
}
