import { strict as assert } from 'assert';
import { VersionControlChangeType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createSandbox, SinonSandbox, SinonStub } from 'sinon';
import * as vscode from 'vscode';

import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { IRawFileChange } from '../../azdo/interface';
import { PullRequestModel } from '../../azdo/pullRequestModel';
import { fromPRUri, fromReviewUri } from '../../common/uri';
import { SETTINGS_NAMESPACE, URI_SCHEME_PR, URI_SCHEME_REVIEW } from '../../constants';

type ChangesResource = [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined];

const ROOT = '/repo';

function rawChange(
	status: VersionControlChangeType,
	filename: string,
	previousFilename?: string,
): IRawFileChange {
	return {
		filename,
		previous_filename: previousFilename,
		status,
		raw_url: '',
		blob_url: '',
		diffHunks: [],
		baseCommit: 'base-sha',
		headCommit: 'head-sha',
	};
}

const RAW_CHANGES: IRawFileChange[] = [
	rawChange(VersionControlChangeType.Add, '/src/added.ts'),
	rawChange(VersionControlChangeType.Edit, '/src/modified.ts', '/src/modified.ts'),
	// AzDO reports a deleted file with an empty path; its name is only in originalPath.
	rawChange(VersionControlChangeType.Delete, '', '/src/deleted.ts'),
	rawChange(VersionControlChangeType.Rename, '/src/renamed.ts', '/src/original.ts'),
];

describe('PullRequestModel.openAllDiffs', function () {
	let sinon: SinonSandbox;
	let executeCommand: SinonStub;
	let pullRequest: PullRequestModel;
	let folderManager: { repository: unknown; activePullRequest: PullRequestModel | undefined };

	function fakePullRequest(changes: IRawFileChange[]): PullRequestModel {
		const fake = {
			getFileChangesInfo: async () => changes,
			getDiffTarget: () => 'merge-base-sha',
			getPullRequestId: () => 42,
			item: { title: 'Add the thing' },
			head: { sha: 'head-sha' },
			azdoRepository: { remote: { remoteName: 'origin' } },
			equals: (other: unknown) => other === fake,
		};
		return fake as unknown as PullRequestModel;
	}

	async function openAll(): Promise<ChangesResource[]> {
		await PullRequestModel.openAllDiffs(folderManager as unknown as FolderRepositoryManager, pullRequest);
		const call = executeCommand.getCalls().find(c => c.args[0] === 'vscode.changes');
		assert.ok(call, 'vscode.changes was not executed');
		assert.equal(call.args[1], 'Pull Request #42: Add the thing');
		return call.args[2] as ChangesResource[];
	}

	beforeEach(function () {
		sinon = createSandbox();
		executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();
		pullRequest = fakePullRequest(RAW_CHANGES);
		folderManager = {
			repository: {
				rootUri: vscode.Uri.file(ROOT),
				getObjectDetails: async () => {
					throw new Error('not available locally');
				},
			},
			activePullRequest: undefined,
		};
	});

	afterEach(async function () {
		sinon.restore();
		await vscode.workspace
			.getConfiguration(SETTINGS_NAMESPACE)
			.update('openAllChanges.testFilesLast', undefined, vscode.ConfigurationTarget.Global);
	});

	it('opens every changed file, labelled by its workspace path', async function () {
		const resources = await openAll();
		assert.deepEqual(
			resources.map(([label]) => label.fsPath),
			['/repo/src/added.ts', '/repo/src/modified.ts', '/repo/src/deleted.ts', '/repo/src/renamed.ts'],
		);
	});

	it('uses pr_azdo URIs when the PR is not checked out', async function () {
		const [added, modified, deleted, renamed] = await openAll();

		assert.equal(added[1], undefined, 'an added file has no base side');
		assert.equal(added[2]?.scheme, URI_SCHEME_PR);
		assert.equal(fromPRUri(added[2]!)?.isBase, false);

		assert.equal(fromPRUri(modified[1]!)?.isBase, true);
		assert.equal(fromPRUri(modified[2]!)?.isBase, false);

		assert.equal(fromPRUri(deleted[1]!)?.fileName, '/src/deleted.ts');
		assert.equal(deleted[2], undefined, 'a deleted file has no head side');

		assert.equal(fromPRUri(renamed[1]!)?.fileName, '/src/original.ts');
		assert.equal(fromPRUri(renamed[2]!)?.fileName, '/src/renamed.ts');
	});

	it('diffs the working tree against review_azdo bases when the PR is checked out', async function () {
		folderManager.activePullRequest = pullRequest;
		const [added, modified, deleted, renamed] = await openAll();

		assert.equal(added[1], undefined);
		assert.equal(added[2]?.scheme, 'file');

		assert.equal(modified[1]?.scheme, URI_SCHEME_REVIEW);
		assert.equal(fromReviewUri(modified[1]!).commit, 'merge-base-sha');
		assert.equal(modified[2]?.fsPath, '/repo/src/modified.ts');

		assert.equal(fromReviewUri(deleted[1]!).path, '/src/deleted.ts');
		assert.equal(deleted[2], undefined);

		assert.equal(fromReviewUri(renamed[1]!).path, '/src/original.ts');
		assert.equal(renamed[2]?.fsPath, '/repo/src/renamed.ts');
	});

	describe('with test files in the PR', function () {
		beforeEach(function () {
			pullRequest = fakePullRequest([
				rawChange(VersionControlChangeType.Edit, '/src/a.test.ts', '/src/a.test.ts'),
				rawChange(VersionControlChangeType.Edit, '/src/a.ts', '/src/a.ts'),
				rawChange(VersionControlChangeType.Delete, '', '/Api.Tests/OldTests.cs'),
				rawChange(VersionControlChangeType.Add, '/src/b.ts'),
			]);
		});

		it('keeps the PR order by default', async function () {
			const resources = await openAll();
			assert.deepEqual(
				resources.map(([label]) => label.fsPath),
				['/repo/src/a.test.ts', '/repo/src/a.ts', '/repo/Api.Tests/OldTests.cs', '/repo/src/b.ts'],
			);
		});

		it('lists test files last, in PR order, when openAllChanges.testFilesLast is on', async function () {
			await vscode.workspace
				.getConfiguration(SETTINGS_NAMESPACE)
				.update('openAllChanges.testFilesLast', true, vscode.ConfigurationTarget.Global);

			const resources = await openAll();
			assert.deepEqual(
				resources.map(([label]) => label.fsPath),
				['/repo/src/a.ts', '/repo/src/b.ts', '/repo/src/a.test.ts', '/repo/Api.Tests/OldTests.cs'],
			);
		});
	});

	it('shows a message instead of an empty editor when the PR has no changes', async function () {
		pullRequest = fakePullRequest([]);
		const showInformationMessage = sinon.stub(vscode.window, 'showInformationMessage').resolves();

		await PullRequestModel.openAllDiffs(folderManager as unknown as FolderRepositoryManager, pullRequest);

		assert.ok(showInformationMessage.calledOnce);
		assert.ok(executeCommand.getCalls().every(c => c.args[0] !== 'vscode.changes'));
	});
});
