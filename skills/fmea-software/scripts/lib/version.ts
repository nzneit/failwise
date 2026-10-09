// The plugin's version, which validate.ts --write records as computed.validator_version. It is
// held here, inside the skill folder, and not read from .claude-plugin/plugin.json, so that
// validate.ts needs no file outside skills/fmea-software/ and records the same version from a
// copy of that folder with no manifest above it. validate.test.ts fails when this value and the
// manifest's version differ, so a release changes both.

export const PLUGIN_VERSION: string = "0.6.0";
