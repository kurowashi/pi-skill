/**
 * Unit: the skills section parser and renderer.
 *
 * Pi's own `formatSkillsForPrompt` is the fixture source, so the parser is
 * pinned to the shape Pi actually emits. If a Pi update changes that shape,
 * these tests fail before the extension can silently drop skills.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { formatSkillsForPrompt, type Skill, type SourceInfo } from "@earendil-works/pi-coding-agent";
import { formatSkillBlock, parseSkillIndex, renderSkillSection, SkillRegistry } from "../../src/skills.ts";

const TOOL_NAME = "skill";
const SOURCE: SourceInfo = { path: "/skills", source: "local", scope: "user", origin: "top-level" };

function skill(name: string, description: string, baseDir: string, disableModelInvocation = false): Skill {
	return {
		name,
		description,
		filePath: `${baseDir}/SKILL.md`,
		baseDir,
		sourceInfo: SOURCE,
		disableModelInvocation,
	};
}

/** Wrap Pi's generated text exactly as `buildSystemPromptSections` does. */
function sectionFor(skills: readonly Skill[]): string {
	return `<skills>\n${formatSkillsForPrompt([...skills], "read").trim()}\n</skills>`;
}

test("parses name, description, and location from Pi's own section", () => {
	const section = sectionFor([skill("pdf-tools", "Extract text & tables.", "/home/u/skills/pdf-tools")]);
	assert.deepEqual(parseSkillIndex(section), [
		{
			name: "pdf-tools",
			description: "Extract text & tables.",
			filePath: "/home/u/skills/pdf-tools/SKILL.md",
			baseDir: "/home/u/skills/pdf-tools",
		},
	]);
});

test("unescapes XML entities in names and descriptions", () => {
	const description = "Use <a> & \"b\" 'c'";
	const section = sectionFor([skill("a&b", description, "/skills/a")]);
	assert.deepEqual(
		parseSkillIndex(section).map((parsed) => ({ name: parsed.name, description: parsed.description })),
		[{ name: "a&b", description }],
	);
});

test("returns an empty index when the section is not in the expected shape", () => {
	assert.deepEqual(parseSkillIndex("<skills>\nno skills here\n</skills>"), []);
	assert.deepEqual(
		parseSkillIndex(
			"<skills>\n<available_skills>\n  <skill><name>x</name><description>y</description></skill>\n</available_skills>\n</skills>",
		),
		[],
	);
	assert.deepEqual(parseSkillIndex(sectionFor([])), []);
});

test("a partially parsed section yields no index", () => {
	const section = [
		"<skills>",
		"<available_skills>",
		"  <skill>",
		"    <name>a</name>",
		"    <description>A.</description>",
		"    <location>/x/a/SKILL.md</location>",
		"  </skill>",
		"  <skill>",
		"    <name>b</name>",
		"    <description>B.</description>",
		"    <extra>true</extra>",
		"    <location>/y/b/SKILL.md</location>",
		"  </skill>",
		"</available_skills>",
		"</skills>",
	].join("\n");
	assert.deepEqual(parseSkillIndex(section), [], "a drop-prone parse must leave the section alone");
});

test("skills hidden from the model never reach the index", () => {
	const section = sectionFor([skill("visible", "V.", "/skills/v"), skill("hidden", "H.", "/skills/h", true)]);
	assert.deepEqual(
		parseSkillIndex(section).map((parsed) => parsed.name),
		["visible"],
	);
});

test("renders the section without locations and with the tool instructions", () => {
	const skills = parseSkillIndex(sectionFor([skill("a", "A skill.", "/x/a"), skill("b", "B <skill>.", "/y/b")]));
	assert.deepEqual(skills.length, 2);
	assert.equal(
		renderSkillSection(skills, TOOL_NAME),
		[
			"<skills>",
			"The following skills provide specialized instructions for specific tasks.",
			"Use the skill tool to load a skill's full instructions when its description matches the task.",
			"The skill tool reports the skill directory; resolve relative paths in the skill against it.",
			"",
			"<available_skills>",
			"  <skill>",
			"    <name>a</name>",
			"    <description>A skill.</description>",
			"  </skill>",
			"  <skill>",
			"    <name>b</name>",
			"    <description>B &lt;skill&gt;.</description>",
			"  </skill>",
			"</available_skills>",
			"</skills>",
		].join("\n"),
	);
});

test("a location-less section is not a source: parsing it yields nothing", () => {
	const skills = parseSkillIndex(sectionFor([skill("a", "A & <B>.", "/x/a")]));
	assert.deepEqual(parseSkillIndex(renderSkillSection(skills, TOOL_NAME)), []);
});

test("formats a loaded skill like Pi's /skill: expansion", () => {
	const [first] = parseSkillIndex(sectionFor([skill("pdf-tools", "Extract.", "/home/u/skills/pdf-tools")]));
	assert.ok(first);
	assert.equal(
		formatSkillBlock(first, "# Body\n\nUse references/x.md."),
		`<skill name="pdf-tools" location="/home/u/skills/pdf-tools/SKILL.md">\nReferences are relative to /home/u/skills/pdf-tools.\n\n# Body\n\nUse references/x.md.\n</skill>`,
	);
});

test("the registry replaces, looks up, and clears entries", () => {
	const registry = new SkillRegistry();
	registry.replace(parseSkillIndex(sectionFor([skill("a", "A.", "/x/a")])));
	assert.equal(registry.get("a")?.filePath, "/x/a/SKILL.md");
	assert.equal(registry.get("missing"), undefined);
	assert.deepEqual(registry.names(), ["a"]);
	registry.replace([]);
	assert.deepEqual(registry.names(), []);
});
