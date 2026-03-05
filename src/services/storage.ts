import type { AppBindings } from "./db";

export async function putJsonFile(
  files: AppBindings["FILES"],
  key: string,
  payload: unknown,
  metadata: Record<string, string> = {}
) {
  const body = JSON.stringify(payload, null, 2);
  await files.put(key, body, {
    httpMetadata: {
      contentType: "application/json",
    },
    customMetadata: metadata,
  });
  return { key, size: body.length };
}

export async function getFile(files: AppBindings["FILES"], key: string) {
  return files.get(key);
}

export async function deleteFile(files: AppBindings["FILES"], key: string) {
  await files.delete(key);
  return { key, deleted: true };
}
