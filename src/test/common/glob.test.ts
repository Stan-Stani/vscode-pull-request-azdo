import { strict as assert } from 'assert';

import { globToRegExp } from '../../common/glob';

function matches(glob: string, path: string): boolean {
	return globToRegExp(glob).test(path);
}

describe('globToRegExp', function () {
	it('matches a leading **/ against zero or more directories', function () {
		assert.ok(matches('**/test/**', 'test/a.ts'));
		assert.ok(matches('**/test/**', 'src/deep/test/a.ts'));
		assert.ok(!matches('**/test/**', 'src/contest/a.ts'));
	});

	it('keeps * and ? within one path segment', function () {
		assert.ok(matches('**/*.test.*', 'src/a.integration.test.tsx'));
		assert.ok(!matches('src/*.ts', 'src/nested/a.ts'));
		assert.ok(matches('src/?.ts', 'src/a.ts'));
		assert.ok(!matches('src/?.ts', 'src/ab.ts'));
	});

	it('expands {a,b} alternation', function () {
		assert.ok(matches('**/*.{test,spec}.*', 'a.spec.js'));
		assert.ok(matches('**/{tests,__tests__}/**', 'apps/x/__tests__/a.ts'));
		assert.ok(!matches('**/*.{test,spec}.*', 'a.stories.tsx'));
	});

	it('treats regex metacharacters literally', function () {
		assert.ok(matches('a+b/(c).ts', 'a+b/(c).ts'));
		assert.ok(!matches('a.ts', 'abts'));
	});

	it('never throws on malformed braces', function () {
		assert.ok(matches('{a,b', 'b'));
		assert.ok(matches('a}', 'a}'));
		assert.ok(matches('a,b', 'a,b'));
	});
});
