export type JsonStructuredContent = Record<string, unknown>;

export function toJsonText(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function normalizeStructuredContent(payload: unknown): JsonStructuredContent {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as JsonStructuredContent;
  }

  return {
    value: payload
  };
}

export function createJsonTextContent(summary: string, payload: unknown): {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent: JsonStructuredContent;
} {
  return {
    content: [
      {
        type: "text" as const,
        text: `${summary}\n\n${toJsonText(payload).trimEnd()}`
      }
    ],
    structuredContent: normalizeStructuredContent(payload)
  };
}

export function createJsonResource(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: toJsonText(payload)
      }
    ]
  };
}

export function encodeResourcePath(relativePath: string): string {
  return encodeURIComponent(relativePath.replace(/\\/gu, "/"));
}

export function decodeResourcePath(encodedPath: string): string {
  return decodeURIComponent(encodedPath);
}
