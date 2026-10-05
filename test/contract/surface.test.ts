/**
 * Contract: the model-facing surface stays one tool and one event.
 *
 * pi-skill removes context from the request, so its own permanent cost must
 * stay measured: exactly the `skill` tool and exactly one
 * `context_with_system` handler. The extension is loaded through Pi's own
 * loader (jiti), the same path Pi uses at runtime, and both the project and
 * global extension directories are redirected to an empty sandbox.
 */

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverAndLoadExtensions, type Extension, type LoadExtensionsResult } from "@earendil-works/pi-coding-agent";
import { PACKAGE_ROOT } from "../helpers/root.ts";

const EXPECTED_EVENTS = ["context_with_system"];
const EXPECTED_TOOLS = ["skill"];

async function loadSkillExtension(): Promise<Extension> {
	const sandbox = mkdtempSync(join(tmpdir(), "pi-skill-surface-"));
	const result: LoadExtensionsResult = await discoverAndLoadExtensions(
		[join(PACKAGE_ROOT, "src", "index.ts")],
		sandbox,
		sandbox,
	);
	assert.deepEqual(result.errors, [], "the extension must load without errors");
	const extension = result.extensions[0];
	assert.ok(extension, "the loader must return the extension");
	assert.equal(result.extensions.length, 1, "the sandbox must load only this extension");
	return extension;
}

test("registers exactly the skill tool", async () => {
	const extension = await loadSkillExtension();
	assert.deepEqual([...extension.tools.keys()], EXPECTED_TOOLS);
	const tool = extension.tools.get("skill");
	assert.ok(tool, "the skill tool must exist");
	assert.ok(
		tool.definition.description.includes("full instructions"),
		"the description must say what the tool returns",
	);
	const snippet = tool.definition.promptSnippet;
	assert.ok(typeof snippet === "string" && !snippet.includes("\n"), "the tool adds one line to the tools section");
});

test("registers one context_with_system handler and nothing else", async () => {
	const extension = await loadSkillExtension();
	assert.deepEqual([...extension.handlers.keys()].sort(), EXPECTED_EVENTS);
	assert.equal(extension.handlers.get("context_with_system")?.length, 1, "one handler owns the rewrite");
	assert.deepEqual([...extension.commands.keys()], []);
	assert.deepEqual([...extension.shortcuts.keys()], []);
	assert.deepEqual([...extension.flags.keys()], []);
});
