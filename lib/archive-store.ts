import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, get, head, put } from "@vercel/blob";

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

// How often a read is tried before giving up on getting the current contents.
const BLOB_READ_ATTEMPTS = 3;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Private store: the files are only reachable with the project's credentials.
//
// A file's contents come through Blob's delivery network, and what arrives
// there is not always what the store holds: in production every write after a
// day file's first update was refused, because the version that came with the
// contents was not the one the store compares against. So the store itself is
// asked what the file is (`head`): its version is the one a write is checked
// against, and its size shows whether the contents that arrived are current.
export function blobStore(): ArchiveStore {
  return {
    async read(file) {
      let problem = "";
      for (let attempt = 0; attempt < BLOB_READ_ATTEMPTS; attempt++) {
        if (attempt > 0) await pause(400 * attempt);
        let stored;
        try {
          stored = await head(file);
        } catch (err) {
          if (err instanceof BlobNotFoundError) return null;
          throw err;
        }
        // Straight from origin storage: a cached copy could be minutes old,
        // and we are about to build the next version of the file on top of it.
        const found = await get(file, { access: "private", useCache: false });
        if (!found || found.statusCode !== 200) {
          problem = `the store has ${stored.size} bytes (version ${stored.etag}), the download found no file`;
          continue;
        }
        const bytes = new Uint8Array(await new Response(found.stream).arrayBuffer());
        // The archive's files only grow, so an older copy is always shorter.
        if (bytes.byteLength === stored.size) {
          return { text: new TextDecoder().decode(bytes), version: stored.etag };
        }
        const via = ["x-vercel-cache", "age", "content-encoding"]
          .map((name) => `${name}: ${found.headers.get(name) ?? "-"}`)
          .join(", ");
        problem =
          `the store has ${stored.size} bytes (version ${stored.etag}), ` +
          `the download gave ${bytes.byteLength} bytes (version ${found.blob.etag}; ${via})`;
      }
      // Never build on a copy that isn't the current one: the write would be
      // refused at best, and drop snapshots at worst.
      throw new Error(`${file}: could not read the current contents: ${problem}`);
    },
    async write(file, text, expected) {
      await put(file, text, {
        access: "private",
        contentType: BLOB_CONTENT_TYPE,
        addRandomSuffix: false,
        // The shortest the delivery network may keep a copy (one minute); the
        // default is a month, and these files change every ten minutes.
        cacheControlMaxAge: 60,
        // An existing file may only be replaced if it still has the version
        // we read; a new file may not replace anything.
        ...(expected === null ? { allowOverwrite: false } : { ifMatch: expected }),
      });
    },
  };
}

// --- A folder on disk (local development, self-hosting) --------------------

const versionOf = (text: string) => createHash("sha256").update(text).digest("hex");

// Writers waiting per file. Checking the version and replacing the file are
// two steps; without a queue, two requests could both pass the check and the
// second would overwrite the first one's snapshot.
const writeQueues = new Map<string, Promise<unknown>>();

function oneAtATime<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => undefined);
  writeQueues.set(key, settled);
  void settled.then(() => {
    if (writeQueues.get(key) === settled) writeQueues.delete(key);
  });
  return run;
}

// For one server process (local development, a single self-hosted instance):
// the queue above lives in memory, so several processes sharing a folder are
// not protected from each other. Vercel Blob is, by its own version check.
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
      return oneAtATime(target, async () => {
        const current = await readText(target);
        const currentVersion = current === null ? null : versionOf(current);
        if (currentVersion !== expected) {
          throw new Error(`${file} changed since it was read`);
        }
        await mkdir(path.dirname(target), { recursive: true });
        // Write a file of our own beside the target, then swap it in: readers
        // never see half a file, and no other write can touch ours.
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
          await rename(temporary, target);
        } catch (err) {
          await rm(temporary, { force: true });
          throw err;
        }
      });
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
