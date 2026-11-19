import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

// Where the history archive keeps its files. Deliberately tiny — read a text
// file, write a text file — so the storage behind it can be swapped without
// touching the code that decides *what* to store (lib/history-archive.ts).
export type StoredFile = {
  text: string;
  // Identifies this exact content; hand it back to `write` to say "replace
  // only if nobody else changed the file since I read it".
  version: string;
};

export type ArchiveStore = {
  // null when the file doesn't exist yet.
  read(file: string): Promise<StoredFile | null>;
  // `expected` is the version from `read`, or null when the file was absent.
  // Must fail rather than overwrite when the file is no longer in that state:
  // a day's file is rewritten many times, and a write based on an outdated
  // copy would silently drop the snapshots added in between.
  write(file: string, text: string, expected: string | null): Promise<void>;
};

// --- Vercel Blob -----------------------------------------------------------

const BLOB_CONTENT_TYPE = "application/x-ndjson";

// Private store: the files are only reachable with the project's credentials.
export function blobStore(): ArchiveStore {
  return {
    async read(file) {
      // Straight from origin storage: a cached copy could be minutes old, and
      // we are about to build the next version of the file on top of it.
      const found = await get(file, { access: "private", useCache: false });
      if (!found || found.statusCode !== 200) return null;
      const text = await new Response(found.stream).text();
      return { text, version: found.blob.etag };
    },
    async write(file, text, expected) {
      await put(file, text, {
        access: "private",
        contentType: BLOB_CONTENT_TYPE,
        addRandomSuffix: false,
        // An existing file may only be replaced if it still has the version
        // we read; a new file may not replace anything.
        ...(expected === null ? { allowOverwrite: false } : { ifMatch: expected }),
      });
    },
  };
}

// --- A folder on disk (local development, self-hosting) --------------------

const versionOf = (text: string) => createHash("sha256").update(text).digest("hex");

export function fileStore(directory: string): ArchiveStore {
  const locate = (file: string) => {
    const target = path.resolve(directory, file);
    if (!target.startsWith(path.resolve(directory) + path.sep)) {
      throw new Error(`Refusing to leave the archive folder: ${file}`);
    }
    return target;
  };
  const readText = async (target: string) => {
    try {
      return await readFile(target, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  return {
    async read(file) {
      const text = await readText(locate(file));
      return text === null ? null : { text, version: versionOf(text) };
    },
    async write(file, text, expected) {
      const target = locate(file);
      const current = await readText(target);
      const currentVersion = current === null ? null : versionOf(current);
      if (currentVersion !== expected) {
        throw new Error(`${file} changed since it was read`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      // Write beside the file, then swap: a crash can't leave half a file.
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, text, "utf8");
      await rename(temporary, target);
    },
  };
}

// --- In memory (tests) -----------------------------------------------------

export function memoryStore(
  files = new Map<string, string>(),
): ArchiveStore & { files: Map<string, string> } {
  return {
    files,
    async read(file) {
      const text = files.get(file);
      return text === undefined ? null : { text, version: versionOf(text) };
    },
    async write(file, text, expected) {
      const current = files.get(file);
      const currentVersion = current === undefined ? null : versionOf(current);
      if (currentVersion !== expected) {
        throw new Error(`${file} changed since it was read`);
      }
      files.set(file, text);
    },
  };
}

// --- Which one this deployment uses ----------------------------------------

type Env = Record<string, string | undefined>;

// null means "no storage configured": the archive is simply off, and the rest
// of the app works as before.
export function getArchiveStore(env: Env = process.env): ArchiveStore | null {
  // Set by hand for local development or self-hosting.
  if (env.HISTORY_ARCHIVE_DIR) return fileStore(env.HISTORY_ARCHIVE_DIR);
  // Set by Vercel when a Blob store is connected to the project.
  if (env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID) return blobStore();
  return null;
}
