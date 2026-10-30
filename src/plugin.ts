// The Plugin's entry. Its Node Types, Workers and Profile fields are still to be decided (see the grill session).
import { definePlugin } from "fyflow-plugin-sdk";

export default definePlugin({
  id: "anidb",
  version: "0.0.0",
  base: import.meta.url,
});
