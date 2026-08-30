/**
 * Writing the farm's folders and files into Drive.
 *
 * The one thing this has to get right is not making duplicates. Drive will
 * happily keep two files called History.md side by side in the same folder and
 * tell you nothing, so a mirror that only ever creates is a mirror that quietly
 * grows a second copy of the farm every time it runs. This has bitten this
 * project before, in the loader that only inserted, and the fix is the same:
 * remember the id, and update what is already there.
 *
 * Ids are remembered in drive_files rather than found by searching, because a
 * search by name is a guess — the owner is free to rename History.md, and if
 * she does, the next mirror should update her renamed file, not create a fresh
 * one beside it.
 */

import { accessTokenFrom } from "./oauth";

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_TYPE = "application/vnd.google-apps.folder";

export type Remembered = {
  get(kind: string, ref: string): Promise<string | null>;
  put(kind: string, ref: string, fileId: string, name: string): Promise<void>;
  forget(kind: string, ref: string): Promise<void>;
};

export class Drive {
  private constructor(
    private readonly token: string,
    private readonly memory: Remembered,
  ) {}

  static async open(refreshToken: string, memory: Remembered): Promise<Drive> {
    return new Drive(await accessTokenFrom(refreshToken), memory);
  }

  /**
   * A folder, made once and reused.
   *
   * If the id we remembered is gone — the owner deleted or trashed the folder —
   * the memory is wrong, not the world, so it is forgotten and the folder is
   * made again. Anything else leaves the mirror permanently broken by one
   * tidy-up in Drive.
   */
  async folder(kind: string, ref: string, name: string, parent: string | null): Promise<string> {
    const known = await this.memory.get(kind, ref);
    if (known !== null && (await this.alive(known))) return known;
    if (known !== null) await this.memory.forget(kind, ref);

    const created = await this.json(FILES + "?fields=id", "POST", {
      name,
      mimeType: FOLDER_TYPE,
      ...(parent === null ? {} : { parents: [parent] }),
    });
    const id = String(created.id);
    await this.memory.put(kind, ref, id, name);
    return id;
  }

  /** A text file, created the first time and overwritten every time after. */
  async text(
    kind: string, ref: string, name: string, parent: string, content: string,
  ): Promise<string> {
    return this.upload(kind, ref, name, parent, "text/markdown", Buffer.from(content, "utf8"));
  }

  async upload(
    kind: string, ref: string, name: string, parent: string,
    mediaType: string, body: Buffer,
  ): Promise<string> {
    const known = await this.memory.get(kind, ref);
    if (known !== null && (await this.alive(known))) {
      await this.media(`${UPLOAD}/${known}?uploadType=media`, "PATCH", mediaType, body);
      await this.memory.put(kind, ref, known, name);
      return known;
    }
    if (known !== null) await this.memory.forget(kind, ref);

    const id = await this.multipart({ name, parents: [parent] }, mediaType, body);
    await this.memory.put(kind, ref, id, name);
    return id;
  }

  /** Whether a remembered id still points at something that is not in the bin. */
  private async alive(id: string): Promise<boolean> {
    const res = await fetch(`${FILES}/${id}?fields=id,trashed`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(await this.explain(res));
    const json = (await res.json()) as { trashed?: boolean };
    return json.trashed !== true;
  }

  private async multipart(
    metadata: Record<string, unknown>, mediaType: string, body: Buffer,
  ): Promise<string> {
    const boundary = `farm-${Date.now().toString(36)}`;
    const parts = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: ${mediaType}\r\n\r\n`,
        "utf8",
      ),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);
    const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(parts),
    });
    if (!res.ok) throw new Error(await this.explain(res));
    return String(((await res.json()) as { id: string }).id);
  }

  private async media(url: string, method: string, mediaType: string, body: Buffer) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${this.token}`, "content-type": mediaType },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(await this.explain(res));
  }

  private async json(url: string, method: string, body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await this.explain(res));
    return (await res.json()) as Record<string, unknown>;
  }

  /**
   * Google's errors are verbose; the owner needs the one sentence that helps.
   *
   * The sentence has to name the actual cause, though. An earlier version
   * answered every 403 with "connect it again", which sent someone round the
   * whole authorisation dance to fix a project setting that reconnecting cannot
   * touch. Where the cause is not one we recognise, Google's own words go
   * through unedited — better a clumsy message that is true than a tidy one
   * that misdirects.
   */
  private async explain(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    const reason = reasonIn(text);

    if (res.status === 401 || res.status === 403) {
      if (reason === "storageQuotaExceeded") {
        return "Google Drive is full. Free some space and write again.";
      }
      if (reason === "accessNotConfigured" || text.includes("has not been used in project")) {
        return (
          "The Google Drive API is not switched on for this project. In Google " +
          "Cloud Console open APIs & Services, Library, search for Google Drive " +
          "API and press Enable, then wait a minute and try again."
        );
      }
      if (reason === "insufficientPermissions" || text.includes("insufficient")) {
        return (
          "The Drive permission granted does not cover this. Reconnect from " +
          "Settings and make sure the consent screen mentions creating files."
        );
      }
      if (reason === "authError" || res.status === 401) {
        return "Google refused the farm's Drive access. Connect it again from Settings.";
      }
      return `Google refused the write: ${messageIn(text) ?? reason ?? "no reason given"}.`;
    }
    if (res.status === 429 || res.status >= 500) {
      return "Google Drive is busy. Try writing again in a minute.";
    }
    return `Google Drive returned ${res.status}: ${messageIn(text) ?? "no detail given"}.`;
  }
}


/** The machine-readable reason Google buries in its error body, if there is one. */
export function reasonIn(body: string): string | null {
  try {
    const json = JSON.parse(body) as {
      error?: { errors?: { reason?: string }[]; status?: string };
    };
    return json.error?.errors?.[0]?.reason ?? json.error?.status ?? null;
  } catch {
    return null;
  }
}

/** Google's own sentence, which is usually the most useful thing it says. */
export function messageIn(body: string): string | null {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    const message = json.error?.message;
    return typeof message === "string" && message.length > 0
      ? message.slice(0, 300)
      : null;
  } catch {
    return null;
  }
}
