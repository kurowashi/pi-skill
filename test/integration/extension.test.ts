/**
 * Integration: the request-time rewrite and the `skill` tool, driven through a
 * fake Pi runtime.
 *
 * The section fixtures come from Pi's own `formatSkillsForPrompt`, so these
 * tests cover the shipped entry point with the shape the model actually
 * receives: locations disappear from the request, the registry follows the
 * final section, and the tool returns the full body from disk.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
	AgentToolResult,
	ContextWithSystemEvent,
	ExtensionAPI,
	ExtensionToolContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt, type Skill, type SourceInfo } from "@earendil-works/pi-coding-agent";
import skillExtension from "../../src/index.ts";

const SOURCE: SourceInfo = { path: "/skills", source: "local", scope: "user", origin: "top-level" };

type Message = ContextWithSystemEvent["messages"][number];

type Handler = (event: ContextWithSystemEvent, ctx?: unknown) => unknown;

interface ContextResult {
	messages: Message[];
}

interface Harness {
	emit(messages: Message[]): Promise<ContextResult | undefined>;
	tool: ToolDefinition;
}

function piSkill(name: string, baseDir: string): Skill {
	return {
		name,
		description: `${name} description`,
		filePath: `${baseDir}/SKILL.md`,
		baseDir,
		sourceInfo: SOURCE,
		disableModelInvocation: false,
	};
}

function sectionFor(skills: readonly Skill[]): string {
	return `<skills>\n${formatSkillsForPrompt([...skills], "read").trim()}\n</skills>`;
}

function sectionsOf(message: Message): Record<string, string | null> | undefined {
	return (message as { sections?: Record<string, string | null> }).sections;
}

function systemMessage(sections: Record<string, string>, timestamp = 1): Message {
	return { role: "system", content: "", sections, timestamp } as unknown as Message;
}

function userMessage(text = "hello", timestamp = 9): Message {
	return { role: "user", content: text, timestamp } as unknown as Message;
}

function createHarness(active: readonly string[] = ["skill"]): Harness {
	const handlers = new Map<string, Handler[]>();
	const tools = new Map<string, ToolDefinition>();
	const pi = {
		on: (event: string, handler: Handler) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {};
		},
		registerTool: (tool: ToolDefinition) => {
			tools.set(tool.name, tool);
		},
		getActiveTools: () => [...active],
	} as unknown as ExtensionAPI;
	skillExtension(pi);
	const handler = handlers.get("context_with_system")?.[0];
	assert.ok(handler, "context_with_system handler must be registered");
	const tool = tools.get("skill");
	assert.ok(tool, "skill tool must be registered");
	return {
		async emit(messages) {
			const result = await handler({ type: "context_with_system", messages } as ContextWithSystemEvent);
			return result as ContextResult | undefined;
		},
		tool,
	};
}

async function load(tool: ToolDefinition, name: string): Promise<AgentToolResult<unknown>> {
	return await tool.execute("call-1", { name }, undefined, undefined, {} as ExtensionToolContext);
}

function textOf(result: AgentToolResult<unknown>): string {
	const [block] = result.content;
	assert.ok(block && block.type === "text", "the result must carry text content");
	return block.text;
}

function temporaryDirectory(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function writeSkill(root: string, name: string, content: string): string {
	const directory = join(root, name);
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "SKILL.md"), content, "utf8");
	return directory;
}

test("removes locations from the request and leaves the transcript alone", async () => {
	const root = temporaryDirectory("pi-skill-section-");
	try {
		const section = sectionFor([piSkill("pdf-tools", join(root, "pdf-tools"))]);
		const messages = [systemMessage({ preamble: "P", skills: section }), userMessage()];
		const result = await createHarness().emit(messages);
		assert.ok(result, "the handler must return the rewritten request");
		const rewritten = sectionsOf(result.messages[0] as Message)?.["skills"];
		assert.equal(typeof rewritten, "string");
		assert.ok(!String(rewritten).includes("<location>"), "locations are request-only context");
		assert.ok(String(rewritten).includes("Use the skill tool"), "the model is told to use the tool");
		assert.deepEqual(result.messages[1], messages[1], "conversation messages are untouched");
		assert.ok(section.includes("<location>"), "the transcript keeps Pi's original section");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("loads the full body and the directory relative paths resolve against", async () => {
	const root = temporaryDirectory("pi-skill-load-");
	try {
		const directory = writeSkill(
			root,
			"pdf-tools",
			"---\nname: pdf-tools\ndescription: ignored\n---\n\n# PDF tools\n\nUse references/formats.md.",
		);
		const harness = createHarness();
		await harness.emit([systemMessage({ skills: sectionFor([piSkill("pdf-tools", directory)]) })]);
		const result = await load(harness.tool, "pdf-tools");
		assert.equal(result.isError, undefined);
		assert.equal(
			textOf(result),
			`<skill name="pdf-tools" location="${directory}/SKILL.md">\nReferences are relative to ${directory}.\n\n# PDF tools\n\nUse references/formats.md.\n</skill>`,
		);
		assert.deepEqual(result.details, { name: "pdf-tools", filePath: `${directory}/SKILL.md` });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("only the skills in the final section are loadable", async () => {
	// Filters such as pi-switch remove skills before the section is rendered;
	// the section is the registry's only source, so hidden skills stay hidden.
	const harness = createHarness();
	await harness.emit([systemMessage({ skills: sectionFor([piSkill("a", "/skills/a"), piSkill("b", "/skills/b")]) })]);
	const result = await load(harness.tool, "c");
	assert.equal(result.isError, true);
	assert.equal(textOf(result), 'Unknown skill "c". Available skills: a, b.');
});

test("reports that no skills are available without a section", async () => {
	const result = await load(createHarness().tool, "a");
	assert.equal(result.isError, true);
	assert.equal(textOf(result), "No skills are available in this session.");
});

test("an inactive tool leaves the prompt untouched", async () => {
	const root = temporaryDirectory("pi-skill-inactive-");
	try {
		const section = sectionFor([piSkill("a", join(root, "a"))]);
		const harness = createHarness([]);
		assert.equal(await harness.emit([systemMessage({ skills: section })]), undefined);
		// The registry is cleared too: without the rewrite the model never saw the skill.
		assert.equal(textOf(await load(harness.tool, "a")), "No skills are available in this session.");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("the latest section patch wins and only that message changes", async () => {
	const root = temporaryDirectory("pi-skill-patch-");
	try {
		const first = sectionFor([piSkill("a", join(root, "a"))]);
		const second = sectionFor([piSkill("b", join(root, "b"))]);
		const messages = [systemMessage({ skills: first }), systemMessage({ skills: second }, 2), userMessage()];
		const result = await createHarness().emit(messages);
		assert.ok(result);
		assert.ok(String(sectionsOf(result.messages[0] as Message)?.["skills"]).includes("<location>"));
		const patched = sectionsOf(result.messages[1] as Message)?.["skills"];
		assert.equal(typeof patched, "string");
		assert.ok(String(patched).includes("b"));
		assert.ok(!String(patched).includes("<location>"));
		assert.deepEqual(result.messages[2], messages[2]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a request without a skills section is left untouched", async () => {
	assert.equal(await createHarness().emit([systemMessage({ preamble: "P" }), userMessage()]), undefined);
});

test("a section that cannot be parsed is left untouched", async () => {
	const harness = createHarness();
	assert.equal(
		await harness.emit([systemMessage({ skills: "<skills>\nnot the expected shape\n</skills>" })]),
		undefined,
	);
	assert.equal(textOf(await load(harness.tool, "a")), "No skills are available in this session.");
});

test("an unreadable skill file fails the call without throwing", async () => {
	const harness = createHarness();
	await harness.emit([systemMessage({ skills: sectionFor([piSkill("gone", "/does/not/exist")]) })]);
	const result = await load(harness.tool, "gone");
	assert.equal(result.isError, true);
	assert.ok(textOf(result).startsWith("Could not read /does/not/exist/SKILL.md:"));
});
