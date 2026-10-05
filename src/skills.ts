/**
 * The skill index: parsing Pi's `<skills>` section, rendering the rewritten
 * one, and formatting the block the `skill` tool returns.
 *
 * Pi renders the model-visible list as an XML section carrying each skill's
 * name, description, and SKILL.md location. pi-skill rewrites that section per
 * request and serves the same parsed index to the `skill` tool, so the two
 * views can never drift apart. Parsing and rendering stay together here.
 */

import { dirname } from "node:path";

/** One skill as it appears in the model-visible section. */
export interface IndexedSkill {
	name: string;
	description: string;
	/** Absolute path of SKILL.md, used to load the skill. */
	filePath: string;
	/** Directory relative paths in the skill resolve against. */
	baseDir: string;
}

const AVAILABLE_SKILLS = /<available_skills>([\s\S]*?)<\/available_skills>/;
const SKILL_ENTRY =
	/<skill>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>([\s\S]*?)<\/location>\s*<\/skill>/g;

const XML_ENTITIES: Readonly<Record<string, string>> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
};

/**
 * Read the model-visible index out of Pi's skills section.
 *
 * Returns an empty array unless every `<skill>` entry parses, so a partial
 * parse can never drop a skill from the model's view: the caller leaves the
 * request untouched instead.
 */
export function parseSkillIndex(section: string): IndexedSkill[] {
	const block = AVAILABLE_SKILLS.exec(section)?.[1];
	if (block === undefined) return [];
	const skills: IndexedSkill[] = [];
	for (const match of block.matchAll(SKILL_ENTRY)) {
		const [, rawName, rawDescription, rawLocation] = match;
		if (rawName === undefined || rawDescription === undefined || rawLocation === undefined) continue;
		const filePath = unescapeXml(rawLocation.trim());
		skills.push({
			name: unescapeXml(rawName.trim()),
			description: unescapeXml(rawDescription.trim()),
			filePath,
			baseDir: dirname(filePath),
		});
	}
	return skills.length === countSkillEntries(block) ? skills : [];
}

/**
 * Render the skills section without locations and with the `skill` tool
 * instructions, keeping Pi's surrounding format.
 */
export function renderSkillSection(skills: readonly IndexedSkill[], toolName: string): string {
	const entries = skills
		.map((skill) =>
			[
				"  <skill>",
				`    <name>${escapeXml(skill.name)}</name>`,
				`    <description>${escapeXml(skill.description)}</description>`,
				"  </skill>",
			].join("\n"),
		)
		.join("\n");
	return [
		"<skills>",
		"The following skills provide specialized instructions for specific tasks.",
		`Use the ${toolName} tool to load a skill's full instructions when its description matches the task.`,
		`The ${toolName} tool reports the skill directory; resolve relative paths in the skill against it.`,
		"",
		"<available_skills>",
		entries,
		"</available_skills>",
		"</skills>",
	].join("\n");
}

/**
 * Format a loaded skill exactly as Pi's `/skill:<name>` expansion does, so the
 * model sees one consistent shape however the skill was invoked.
 */
export function formatSkillBlock(skill: IndexedSkill, body: string): string {
	return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

/** The model-visible skills from the last request, keyed by name. */
export class SkillRegistry {
	private skills = new Map<string, IndexedSkill>();

	replace(skills: readonly IndexedSkill[]): void {
		this.skills = new Map(skills.map((skill) => [skill.name, skill]));
	}

	get(name: string): IndexedSkill | undefined {
		return this.skills.get(name);
	}

	names(): string[] {
		return [...this.skills.keys()];
	}
}

function countSkillEntries(block: string): number {
	return block.match(/<skill>/g)?.length ?? 0;
}

function unescapeXml(value: string): string {
	return value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
