/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile a glob for matching repo-relative paths ('src/a.test.ts', no leading slash) to a RegExp.
 * Supports `**` (any number of directories - including none when a `/` follows it), `*` and `?`
 * (never cross a `/`) and `{a,b}` alternation. Never throws: an unclosed `{` is closed at the end and a
 * stray `}` or `,` is literal, so a mistyped user setting just matches less instead of breaking.
 */
export function globToRegExp(glob: string): RegExp {
	let braceDepth = 0;
	let source = glob.replaceAll(/\*\*\/|\*\*|[*?{},]|[$()+.[\\\]^|]/g, token => {
		switch (token) {
			case '**/':
				return '(?:.*/)?';
			case '**':
				return '.*';
			case '*':
				return '[^/]*';
			case '?':
				return '[^/]';
			case '{':
				braceDepth++;
				return '(?:';
			case '}':
				if (braceDepth === 0) {
					return String.raw`\}`;
				}
				braceDepth--;
				return ')';
			case ',':
				return braceDepth > 0 ? '|' : ',';
			default:
				return `\\${token}`;
		}
	});
	source += ')'.repeat(braceDepth);
	return new RegExp(`^${source}$`);
}
