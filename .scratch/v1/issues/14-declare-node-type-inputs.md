# 14: Declare what each Node Type takes as input

**What to build:** A Flow author or an Agent can see what each Node Type's Task input must hold without reading the
code: every Worker declares an `inputSchema` (fyflow's subset), with the fields' types, a description saying which
fields identify what (an episode by `eid`, or by `aid` and `epno`), and an example of each form. The Host shows it in
the editor, makes a Flow starting at the Node Type take it as the Run's input form (fyflow-app ADR-0019), gives it to
Agents over MCP, and checks a Run's payload against it at start. The README lists each Node Type's input and result.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Every Node Type's Worker declares an `inputSchema` fyflow takes, with a description and at least one example.
- [x] Every example is an input its Worker takes (it never fails as one the Worker refuses).
- [x] Fields the Worker passes through stay allowed (`additionalProperties` open), so a Flow chaining Node Types still
      starts.
- [x] The README lists each Node Type's input and result.

## Comments

- Asked by the maintainer: what AniDBEpisode's input is was unclear, for every Node Type.
- fyflow's schema subset has no `anyOf`/`oneOf`, so the two forms (`eid`, or `aid` and `epno`; `fid`, or `ed2k` and
  `size`; `aid`, or `title`) cannot be required: each field is typed, the description says which form wins, and an
  example shows each. Only AniDBIdentifyFile (`ed2k`, `size`) and AniDBHashFile (`path`) require their fields.
- Since a Run's payload is checked against the first Node's schema at start, a wrong type (an `eid` as a string) now
  fails the Run at start instead of its first Task.
- Tested at the Plugin's entry: every schema passes fyflow's `schemaProblem` (subset, and examples that meet it); every
  example of a Session Node Type is one its Worker takes (run with a cancelled Task, it ends cancelled, never
  refused). AniDBHashFile's examples need a file and are not run.
- The schemas sit in `src/inputs.ts`, apart from the Workers, so the Plugin's entry loads no Worker.
- Not done: `outputSchema`s, which would let the editor suggest paths such as `found` for an Edge's condition.
