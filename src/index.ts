/**
 * pi-skill: load skills through a `skill` tool and keep SKILL.md paths out of
 * the always-on system prompt.
 *
 * Pi lists every model-invocable skill in the `skills` section as name,
 * description, and absolute location, and tells the model to read SKILL.md.
 * The locations cost context on every request and reading can come back
 * partial. This extension rewrites the section for each request — locations
 * removed, instructions pointing at the `skill` tool — and serves the same
 * index to the tool. When neither `read` nor `bash` is selected, Pi omits the
 * section entirely; the extension supplies it in Pi's format because the
 * `skill` tool does not need those tools.
 *
 * The rewrite happens in `context_with_system`, after every
 * `before_agent_start` handler has shaped the section. Filters such as
 * pi-switch's skill toggles therefore always win, the rewrite does not depend
 * on extension load order, and the transcript keeps Pi's original section, so
 * compaction, resume, and `/reload` are unaffected.
 */

import { readFile } from "node:fs/promises";
import { getCurrentSystemMessage } from "@earendil-works/pi-ai";
import type {
	AgentToolResult,
	ContextEventResult,
	ContextWithSystemEvent,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt, stripFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatSkillBlock, type IndexedSkill, parseSkillIndex, renderSkillSection, SkillRegistry } from "./skills.ts";

const TOOL_NAME = "skill";
const SKILLS_SECTION = "skills";

type TranscriptMessage = ContextWithSystemEvent["messages"][number];

interface SkillToolDetails {
	name?: string;
	filePath?: string;
}

export default function skillExtension(pi: ExtensionAPI): void {
	const registry = new SkillRegistry();

	pi.registerTool({
		name: TOOL_NAME,
		label: "Skill",
		description:
			"Load a skill's full instructions by name. The skills section of the system prompt lists the available skills and when each applies. Returns the instructions and the skill directory that relative paths resolve against.",
		promptSnippet: "Load a skill's full instructions by name",
		parameters: Type.Object({
			name: Type.String({ description: "Skill name exactly as shown in the skills section of the system prompt." }),
		}),
		async execute(_toolCallId, params) {
			const skill = registry.get(params.name);
			if (skill === undefined) {
				const names = registry.names();
				return errorResult(
					names.length === 0
						? "No skills are available in this session."
						: `Unknown skill "${params.name}". Available skills: ${names.join(", ")}.`,
				);
			}
			try {
				const body = stripFrontmatter(await readFile(skill.filePath, "utf8")).trim();
				return {
					content: [{ type: "text" as const, text: formatSkillBlock(skill, body) }],
					details: { name: skill.name, filePath: skill.filePath },
				};
			} catch (error) {
				return errorResult(`Could not read ${skill.filePath}: ${messageOf(error)}`);
			}
		},
	});

	pi.on("before_agent_start", (event) => {
		// Pi generates the skills section only when a file-read tool (`read` or
		// `bash`) is selected, because its instructions load skills with those
		// tools. The `skill` tool replaces that path, so supply the same format
		// when neither is selected; `context_with_system` then rewrites it.
		if (!pi.getActiveTools().includes(TOOL_NAME)) return;
		const { selectedTools, skills, sections } = event.systemPromptOptions;
		if (selectedTools.includes("read") || selectedTools.includes("bash")) return;
		// Another extension may already own this section; only fill the gap Pi left.
		if (SKILLS_SECTION in sections) return;
		const prompt = formatSkillsForPrompt(skills ?? [], "read").trim();
		if (prompt) sections[SKILLS_SECTION] = prompt;
	});

	pi.on("context_with_system", (event) => {
		// A disabled tool must not leave a prompt that tells the model to call it.
		if (!pi.getActiveTools().includes(TOOL_NAME)) return forgetSkills(registry);
		const section = getCurrentSystemMessage(event.messages)?.sections?.[SKILLS_SECTION];
		if (typeof section !== "string") return forgetSkills(registry);
		const skills = parseSkillIndex(section);
		if (skills.length === 0) return forgetSkills(registry);
		registry.replace(skills);
		return rewriteSection(event.messages, section, skills);
	});
}

/** Drop the registry so a stale index cannot serve a request that has no section. */
function forgetSkills(registry: SkillRegistry): undefined {
	registry.replace([]);
	return undefined;
}

/**
 * Swap the effective skills section in the request only. The message that
 * carries it is replaced in place, so the transcript shape stays as Pi built
 * it; the transcript itself is never modified.
 */
function rewriteSection(
	messages: readonly TranscriptMessage[],
	section: string,
	skills: readonly IndexedSkill[],
): ContextEventResult | undefined {
	const rewritten = renderSkillSection(skills, TOOL_NAME);
	if (rewritten === section) return undefined;
	const index = lastSectionMessageIndex(messages);
	const message = index === -1 ? undefined : messages[index];
	if (message === undefined || message.role !== "system") return undefined;
	return {
		messages: messages.map((entry, position) =>
			position === index ? { ...message, sections: { ...message.sections, [SKILLS_SECTION]: rewritten } } : entry,
		),
	};
}

/** Index of the message carrying the effective skills section, or -1. */
function lastSectionMessageIndex(messages: readonly TranscriptMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "system" && typeof message.sections?.[SKILLS_SECTION] === "string") return index;
	}
	return -1;
}

function errorResult(text: string): AgentToolResult<SkillToolDetails> {
	return { content: [{ type: "text", text }], details: {}, isError: true };
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
