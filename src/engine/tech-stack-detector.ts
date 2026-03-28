import fs from "node:fs";
import path from "node:path";

import type { FileScanEntry, TechStackSummary } from "../types.js";

const CONFIG_FILE_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "packages.config",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock"
]);

const CONFIG_FILE_SUFFIXES = [".csproj", ".sln"];
const KNOWN_JS_FRAMEWORKS = ["react", "next", "vite", "express", "fastify", "vue", "svelte", "nestjs"];
const KNOWN_TEXT_FRAMEWORKS = [
  { framework: "django", patterns: ["django"] },
  { framework: "flask", patterns: ["flask"] },
  { framework: "fastapi", patterns: ["fastapi"] },
  { framework: "gin", patterns: ["github.com/gin-gonic/gin"] },
  { framework: "echo", patterns: ["github.com/labstack/echo"] },
  { framework: "fiber", patterns: ["github.com/gofiber/fiber"] },
  { framework: "actix-web", patterns: ["actix-web"] },
  { framework: "rocket", patterns: ["rocket"] },
  { framework: "axum", patterns: ["axum"] },
  { framework: "spring", patterns: ["spring", "spring-boot"] },
  { framework: "quarkus", patterns: ["quarkus"] },
  { framework: "aspnetcore", patterns: ["Microsoft.AspNetCore"] },
  { framework: "rails", patterns: ["rails"] },
  { framework: "sinatra", patterns: ["sinatra"] },
  { framework: "laravel", patterns: ["laravel/framework"] },
  { framework: "symfony", patterns: ["symfony/"] },
  { framework: "cakephp", patterns: ["cakephp/cakephp"] }
];

function isConfigFile(relativePath: string): boolean {
  const fileName = path.basename(relativePath);
  return CONFIG_FILE_NAMES.has(fileName) || CONFIG_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function readProjectFile(projectRoot: string, relativePath: string): string {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return "";
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function detectPackageManagers(configFiles: string[]): string[] {
  const managers = new Set<string>();
  const hasSuffix = (suffix: string) => configFiles.some((filePath) => path.basename(filePath).endsWith(suffix));

  if (configFiles.includes("package-lock.json")) {
    managers.add("npm");
  }
  if (configFiles.includes("pnpm-lock.yaml")) {
    managers.add("pnpm");
  }
  if (configFiles.includes("yarn.lock")) {
    managers.add("yarn");
  }
  if (configFiles.includes("requirements.txt")) {
    managers.add("pip");
  }
  if (configFiles.includes("poetry.lock")) {
    managers.add("poetry");
  }
  if (configFiles.includes("Pipfile") || configFiles.includes("Pipfile.lock")) {
    managers.add("pipenv");
  }
  if (configFiles.includes("go.mod")) {
    managers.add("go");
  }
  if (configFiles.includes("Cargo.toml")) {
    managers.add("cargo");
  }
  if (configFiles.includes("pom.xml")) {
    managers.add("maven");
  }
  if (configFiles.includes("build.gradle") || configFiles.includes("build.gradle.kts")) {
    managers.add("gradle");
  }
  if (configFiles.includes("Gemfile") || configFiles.includes("Gemfile.lock")) {
    managers.add("bundler");
  }
  if (configFiles.includes("composer.json") || configFiles.includes("composer.lock")) {
    managers.add("composer");
  }
  if (configFiles.includes("packages.config") || hasSuffix(".csproj") || hasSuffix(".sln")) {
    managers.add("dotnet");
  }

  return Array.from(managers).sort();
}

function detectLanguages(files: FileScanEntry[], configFiles: string[]): string[] {
  const languages = new Set<string>();

  for (const file of files) {
    const extension = path.extname(file.relativePath).toLowerCase();
    if (extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts") {
      languages.add("typescript");
    } else if (extension === ".js" || extension === ".jsx" || extension === ".mjs" || extension === ".cjs") {
      languages.add("javascript");
    } else if (extension === ".py") {
      languages.add("python");
    } else if (extension === ".go") {
      languages.add("go");
    } else if (extension === ".rs") {
      languages.add("rust");
    } else if (extension === ".java") {
      languages.add("java");
    } else if (extension === ".cs") {
      languages.add("csharp");
    } else if (extension === ".rb") {
      languages.add("ruby");
    } else if (extension === ".php") {
      languages.add("php");
    } else if (extension === ".json") {
      languages.add("json");
    }
  }

  if (configFiles.includes("pyproject.toml") || configFiles.includes("requirements.txt") || configFiles.includes("Pipfile")) {
    languages.add("python");
  }
  if (configFiles.includes("go.mod")) {
    languages.add("go");
  }
  if (configFiles.includes("Cargo.toml")) {
    languages.add("rust");
  }
  if (
    configFiles.includes("pom.xml") ||
    configFiles.includes("build.gradle") ||
    configFiles.includes("build.gradle.kts") ||
    configFiles.includes("settings.gradle") ||
    configFiles.includes("settings.gradle.kts")
  ) {
    languages.add("java");
  }
  if (configFiles.some((filePath) => filePath.endsWith(".csproj") || filePath.endsWith(".sln") || filePath === "packages.config")) {
    languages.add("csharp");
  }
  if (configFiles.includes("Gemfile")) {
    languages.add("ruby");
  }
  if (configFiles.includes("composer.json")) {
    languages.add("php");
  }

  return Array.from(languages).sort();
}

function detectFrameworks(projectRoot: string, configFiles: string[]): string[] {
  const frameworks = new Set<string>();
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const raw = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...(raw.dependencies ?? {}),
      ...(raw.devDependencies ?? {})
    };
    for (const framework of KNOWN_JS_FRAMEWORKS) {
      if (framework in dependencies) {
        frameworks.add(framework);
      }
    }
  }

  const searchableSources = configFiles
    .filter((relativePath) =>
      [
        "requirements.txt",
        "pyproject.toml",
        "Pipfile",
        "go.mod",
        "Cargo.toml",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "Gemfile",
        "composer.json"
      ].includes(path.basename(relativePath)) || relativePath.endsWith(".csproj")
    )
    .map((relativePath) => readProjectFile(projectRoot, relativePath).toLowerCase());

  for (const definition of KNOWN_TEXT_FRAMEWORKS) {
    if (searchableSources.some((source) => definition.patterns.some((pattern) => source.includes(pattern.toLowerCase())))) {
      frameworks.add(definition.framework);
    }
  }

  return Array.from(frameworks).sort();
}

export function detectTechStack(projectRoot: string, files: FileScanEntry[]): TechStackSummary {
  const configFiles = files
    .map((file) => file.relativePath)
    .filter((relativePath) => isConfigFile(relativePath))
    .sort((left, right) => left.localeCompare(right));

  return {
    packageManagers: detectPackageManagers(configFiles),
    frameworks: detectFrameworks(projectRoot, configFiles),
    languages: detectLanguages(files, configFiles),
    configFiles
  };
}
