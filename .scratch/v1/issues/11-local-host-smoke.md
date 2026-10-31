# 11: Local Host smoke (`pnpm smoke`)

**What to build:** Before a release, the maintainer can prove the built package works in a real Host: `pnpm smoke` installs it into the Plugin directory of a Host built from `../fyflow-app`, as npm would, and runs a Flow that hashes a file, identifies it and adds it to MyList against the fake AniDB, on Node and on Deno.

**Blocked by:** 02, 05, 06

**Status:** ready-for-agent

- [ ] `pnpm smoke` builds and packs this package, lays it out with the SDK under a temporary Plugin directory's `node_modules`, and starts a Host from `../fyflow-app` on it, with a Profile pointing at the fake AniDB and granting a temporary Root.
- [ ] A Flow hash → identify → MyList add runs to the end on Node 26 and on Deno, and the fake AniDB received the expected packets.
- [ ] The Host's Plugin list (`GET /api/plugins`) shows the Plugin with its Node Types and no warnings.
- [ ] It fails clearly when `../fyflow-app` is missing or not built; it is not part of `pnpm check` or CI.
- [ ] How the Session is pointed at the fake AniDB (an address override for tests) is not a user-visible Profile field.
