// The `AniDBMyListAdd` Worker: adds a file to MyList, by fid or by ed2k and size. A file already there is left as it
// is, so re-running a Flow is harmless, unless the Flow sets `edit`. The result keeps the rest of the input.
import { AnidbError, RESPONSE_CODE } from "anidb-udp-client";
import type { TaskEnvelope, Worker, WorkerContext } from "fyflow-plugin-sdk";
import { fileRef } from "./file-ref.ts";
import { MYLIST_STATES, type MyListOptions, type MyListSettings } from "./mylist-settings.ts";
import { isNotFound } from "./not-found.ts";
import { type SessionFields, session } from "./session.ts";

type Input = { [field: string]: unknown } | null | undefined;

/** The entry's values the settings set, as the library takes them. */
function optionsOf(settings: MyListSettings): MyListOptions {
  const { state, viewed, viewdate, source, storage, other } = settings;
  if (state !== undefined && !(MYLIST_STATES as readonly string[]).includes(state))
    throw new Error(`MyList has no state ${state}: fix \`state\` to one of ${MYLIST_STATES.join(", ")}`);
  const options = { state, viewed, viewdate, source, storage, other };
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

const isAlreadyInMyList = (error: unknown): error is AnidbError =>
  error instanceof AnidbError && error.code === RESPONSE_CODE.FILE_ALREADY_IN_MYLIST;

export default class MyListAdd implements Worker<MyListSettings, Input> {
  readonly #fields: SessionFields;

  constructor(fields: SessionFields) {
    this.#fields = fields;
  }

  async run({ settings, input }: TaskEnvelope<MyListSettings, Input>, context: WorkerContext) {
    const file = fileRef("AniDBMyListAdd", input);
    const options = optionsOf(settings);
    let entry: Record<string, unknown>;
    try {
      // Always an options object: given none, the library sends nothing and answers undefined.
      const added = await session().request(
        this.#fields,
        ({ client }) => client.mylist_add_by_file(file, options),
        context,
      );
      if (added?.code !== "MYLIST_ENTRY_ADDED") throw new Error(`AniDB did not add the file: ${added?.code}`);
      return { ...input, added: true, lid: added.lid };
    } catch (error) {
      if (isNotFound(error)) return { ...input, added: false, found: false };
      if (!isAlreadyInMyList(error)) throw error;
      entry = error.payload ?? {};
    }
    const { lid } = entry;
    if (typeof lid !== "number" || !Number.isInteger(lid))
      throw new Error("AniDB said the file is already in MyList but gave no entry for it");
    if (settings.edit !== true) return { ...input, added: false, lid, entry };
    // Editing by the entry's lid: only the values the settings set change.
    try {
      const edited = await session().request(
        this.#fields,
        ({ client }) => client.mylist_add_by_file({ lid }, options),
        context,
      );
      if (edited?.code !== "MYLIST_ENTRY_EDITED")
        throw new Error(`AniDB did not edit the entry: ${edited?.code}`);
    } catch (error) {
      // The entry went from MyList between the two requests.
      if (isNotFound(error)) return { ...input, added: false, found: false };
      throw error;
    }
    return { ...input, added: false, edited: true, lid };
  }
}
