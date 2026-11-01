// Holds a Worker's result to its Node Type's declared output schema, as fyflow would hold a result given by hand.
import { findings } from "fyflow-orchestration";
import plugin from "../src/plugin.ts";

/** What in `result` breaks `nodeType`'s output schema: nothing when it meets it. */
export function outputFindings(nodeType: string, result: unknown) {
  const schema = plugin.workers?.[plugin.nodeTypes?.[nodeType]?.worker ?? ""]?.outputSchema;
  if (schema === undefined) throw new Error(`${nodeType} declares no output schema`);
  return findings(schema, result);
}

/** `result`, once it meets `nodeType`'s output schema: a test's result assertion holds it to the schema as well. */
export async function meets<T>(nodeType: string, result: Promise<T>): Promise<T> {
  const value = await result;
  const problems = outputFindings(nodeType, value);
  if (problems.length > 0)
    throw new Error(`${nodeType}'s result breaks its output schema: ${JSON.stringify(problems)}`);
  return value;
}
