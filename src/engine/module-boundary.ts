export function computeModuleBoundary(relativePath: string): string {
  const normalized = relativePath.replace(/\\/gu, "/");
  const segments = normalized.split("/");

  if (segments[0] === "src" && segments.length >= 3) {
    return `${segments[0]}/${segments[1]}`;
  }

  if (segments.length <= 2) {
    return segments[0] ?? ".";
  }

  return segments.slice(0, 2).join("/");
}
