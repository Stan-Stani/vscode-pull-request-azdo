import { strict as assert } from 'assert';

import { PullRequestModel } from '../azdo/pullRequestModel';
import { RepositoriesManager } from '../azdo/repositoriesManager';
import { resolveTargetPullRequest } from '../commands';
import { DescriptionNode } from '../view/treeNodes/descriptionNode';
import { PRNode } from '../view/treeNodes/pullRequestNode';

describe('resolveTargetPullRequest', function () {
	// Prototype-only instances: resolveTargetPullRequest only checks instanceof and reads fields.
	const activePullRequest = Object.create(PullRequestModel.prototype) as PullRequestModel;
	const reposManager = {
		folderManagers: [{ activePullRequest }],
	} as unknown as RepositoriesManager;

	it('uses the PR a tree node points at', async function () {
		const otherPullRequest = Object.create(PullRequestModel.prototype) as PullRequestModel;
		const prNode = Object.assign(Object.create(PRNode.prototype), { pullRequestModel: otherPullRequest }) as PRNode;
		const descriptionNode = Object.assign(Object.create(DescriptionNode.prototype), {
			pullRequestModel: otherPullRequest,
		}) as DescriptionNode;

		assert.equal(await resolveTargetPullRequest(reposManager, prNode), otherPullRequest);
		assert.equal(await resolveTargetPullRequest(reposManager, descriptionNode), otherPullRequest);
		assert.equal(await resolveTargetPullRequest(reposManager, otherPullRequest), otherPullRequest);
	});

	it('falls back to the checked-out PR with no argument', async function () {
		assert.equal(await resolveTargetPullRequest(reposManager), activePullRequest);
	});

	it("falls back to the checked-out PR for an argument that isn't a PR", async function () {
		// A view's title-bar button receives that view's focused tree item - in the changes view, a file node.
		const focusedFileNode = { fileName: '/src/a.ts' } as unknown as PullRequestModel;

		assert.equal(await resolveTargetPullRequest(reposManager, focusedFileNode), activePullRequest);
	});
});
