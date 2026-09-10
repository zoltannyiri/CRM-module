import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function getBaseStorageDir() {
  return process.env.DOCUMENT_STORAGE_DIR
    ? path.resolve(process.env.DOCUMENT_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "documents");
}

function getSafeFileExtension(originalFileName = "") {
  const ext = path.extname(originalFileName).toLowerCase();
  // Safe alphanumeric extension up to 10 chars
  if (/^\.[a-z0-9]{1,10}$/.test(ext)) {
    return ext;
  }
  return "";
}

function resolveStoragePath(storageKey) {
  const baseDir = path.resolve(getBaseStorageDir());
  const fullPath = path.resolve(baseDir, storageKey);
  const relativePath = path.relative(baseDir, fullPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Érvénytelen tárolási azonosító.");
  }
  return fullPath;
}

/**
 * Saves a file buffer to storage.
 * Returns the storageKey and size.
 */
export async function saveFile({ organizationId, buffer, originalFileName = "" }) {
  if (!organizationId) {
    throw new Error("Hiányzó szervezeti azonosító a fájl mentéséhez.");
  }
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Hiányzó vagy érvénytelen fájl bináris tartalom.");
  }

  const baseDir = getBaseStorageDir();
  const orgDir = path.join(baseDir, String(organizationId));
  await fs.mkdir(orgDir, { recursive: true });

  const ext = getSafeFileExtension(originalFileName);
  const fileUuid = randomUUID();
  const storageKey = `${organizationId}/${fileUuid}${ext}`;
  const fullPath = path.join(baseDir, storageKey);

  await fs.writeFile(fullPath, buffer);

  return {
    storageKey,
    size: buffer.length,
  };
}

/**
 * Retrieves a readable stream and file info for a given storageKey.
 */
export async function getFile({ storageKey }) {
  if (!storageKey) {
    throw new Error("Hiányzó tárolási azonosító.");
  }

  const fullPath = resolveStoragePath(storageKey);
  if (!existsSync(fullPath)) {
    return null;
  }

  const stat = await fs.stat(fullPath);
  return {
    fullPath,
    size: stat.size,
    createReadStream: () => createReadStream(fullPath),
  };
}

/**
 * Deletes a file from storage.
 * Silently ignores ENOENT (file not found).
 */
export async function deleteFile({ storageKey }) {
  if (!storageKey) return;
  try {
    const fullPath = resolveStoragePath(storageKey);
    await fs.unlink(fullPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

/**
 * Moves a file aside before a related database delete. The caller can then
 * either commit the deletion or restore the original file if the DB fails.
 */
export async function stageFileDeletion({ storageKey }) {
  if (!storageKey) throw new Error("Hiányzó tárolási azonosító.");
  const originalPath = resolveStoragePath(storageKey);
  const stagedPath = `${originalPath}.deleting-${randomUUID()}`;
  try {
    await fs.rename(originalPath, stagedPath);
  } catch (error) {
    if (error.code === "ENOENT") return { existed: false, commit: async () => {}, rollback: async () => {} };
    throw error;
  }
  let settled = false;
  return {
    existed: true,
    async commit() {
      if (settled) return;
      await fs.unlink(stagedPath);
      settled = true;
    },
    async rollback() {
      if (settled) return;
      await fs.rename(stagedPath, originalPath);
      settled = true;
    },
  };
}

export default {
  saveFile,
  getFile,
  deleteFile,
  stageFileDeletion,
};
