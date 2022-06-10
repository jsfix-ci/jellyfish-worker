import { strict as assert } from 'assert';
import {
	testUtils as autumndbTestUtils,
	RelationshipContractDefinition,
} from 'autumndb';
import _ from 'lodash';
import { testUtils, TransformerContract } from '../../lib';

let ctx: testUtils.TestContext;
let loop: any;

beforeAll(async () => {
	ctx = await testUtils.newContext();
	await createTaskRelationships();
	loop = await ctx.kernel.insertContract(ctx.logContext, ctx.session, {
		type: 'loop@1.0.0',
	});
});

afterAll(() => {
	return testUtils.destroyContext(ctx);
});

describe('transformers', () => {
	test('should create a task if a transformer matches a contract that changed artifactReady:false->true', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Link the loop as the owner of the transformer
		await ctx.createLink(loop, transformer, 'owns', 'is owned by');

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: false,
					},
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Update the contract
		await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			contract,
			[
				{
					op: 'replace',
					path: '/data/$transformer/artifactReady',
					value: true,
				},
			],
		);
		await ctx.flushAll(ctx.session);

		// Assert that the expected task contract was created
		const task = await ctx.waitForMatch({
			type: 'object',
			properties: {
				type: {
					const: 'task@1.0.0',
				},
				data: {
					type: 'object',
					required: ['status', 'transformer'],
					properties: {
						status: {
							const: 'pending',
						},
						transformer: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									const: transformer.id,
								},
							},
						},
					},
				},
			},
		});

		// Assert that the expected link contract was created
		await ctx.waitForMatch({
			type: 'object',
			properties: {
				type: {
					const: 'link@1.0.0',
				},
				name: {
					const: 'generated',
				},
				data: {
					type: 'object',
					required: ['inverseName', 'from', 'to'],
					properties: {
						inverseName: {
							const: 'was generated by',
						},
						from: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: transformer.id,
								},
								type: {
									const: transformer.type,
								},
							},
						},
						to: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: task.id,
								},
								type: {
									const: task.type,
								},
							},
						},
					},
				},
			},
		});
	});

	test('should create a task if a transformer matches a contract that changed artifactReady:truthy->other-truthy', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Link the loop as the owner of the transformer
		await ctx.createLink(loop, transformer, 'owns', 'is owned by');

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: true,
					},
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Update the contract
		await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			contract,
			[
				{
					op: 'replace',
					path: '/data/$transformer/artifactReady',
					value: new Date().toISOString(),
				},
			],
		);
		await ctx.flushAll(ctx.session);

		// Assert than expected task contracts were created
		await ctx.retry(
			() => {
				return ctx.kernel.query(ctx.logContext, ctx.session, {
					type: 'object',
					properties: {
						type: {
							const: 'task@1.0.0',
						},
						data: {
							type: 'object',
							required: ['status', 'transformer'],
							properties: {
								transformer: {
									type: 'object',
									required: ['id'],
									properties: {
										id: {
											const: transformer.id,
										},
									},
								},
							},
						},
					},
				});
			},
			(tasks: any[]) => {
				return tasks.length === 2;
			},
		);

		// Assert that the expected link contracts were created
		await ctx.retry(
			() => {
				return ctx.kernel.query(ctx.logContext, ctx.session, {
					type: 'object',
					properties: {
						type: {
							const: 'link@1.0.0',
						},
						name: {
							const: 'generated',
						},
						data: {
							type: 'object',
							required: ['inverseName', 'from'],
							properties: {
								inverseName: {
									const: 'was generated by',
								},
								from: {
									type: 'object',
									required: ['id', 'type'],
									properties: {
										id: {
											const: transformer.id,
										},
										type: {
											const: transformer.type,
										},
									},
								},
							},
						},
					},
				});
			},
			(links: any[]) => {
				return links.length === 2;
			},
		);
	});

	test('should create a task if a transformer matches a contract that was ready before, but only matches now', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
						properties: {
							data: {
								type: 'object',
								required: ['a'],
								properties: {
									a: {
										const: 1,
									},
								},
							},
						},
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Link the loop as the owner of the transformer
		await ctx.createLink(loop, transformer, 'owns', 'is owned by');

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: '2018-12-18T11:08:45Z',
					},
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Update the contract
		await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			contract,
			[
				{
					op: 'replace',
					path: '/data/$transformer/artifactReady',
					value: '2018-12-18T11:08:45Z',
				},
				{
					op: 'replace',
					path: '/data/a',
					value: 1,
				},
			],
		);
		await ctx.flushAll(ctx.session);

		// Assert that the expected task contract was created
		const task = await ctx.waitForMatch({
			type: 'object',
			properties: {
				type: {
					const: 'task@1.0.0',
				},
				data: {
					type: 'object',
					required: ['status', 'transformer'],
					properties: {
						status: {
							const: 'pending',
						},
						transformer: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									const: transformer.id,
								},
							},
						},
					},
				},
			},
		});

		// Assert that the expected link contract was created
		await ctx.waitForMatch({
			type: 'object',
			properties: {
				type: {
					const: 'link@1.0.0',
				},
				name: {
					const: 'generated',
				},
				data: {
					type: 'object',
					required: ['inverseName', 'from', 'to'],
					properties: {
						inverseName: {
							const: 'was generated by',
						},
						from: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: transformer.id,
								},
								type: {
									const: transformer.type,
								},
							},
						},
						to: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: task.id,
								},
								type: {
									const: task.type,
								},
							},
						},
					},
				},
			},
		});
	});

	test('should only create a task when a transformer matches the input for an updated contract', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
						properties: {
							name: {
								type: 'string',
								const: 'baz',
							},
						},
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Link the loop as the owner of the transformer
		await ctx.createLink(loop, transformer, 'owns', 'is owned by');

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: false,
					},
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Update the contract
		await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			contract,
			[
				{
					op: 'replace',
					path: '/data/$transformer/artifactReady',
					value: true,
				},
			],
		);
		await ctx.flushAll(ctx.session);

		// Give the system a few seconds to run just in case
		await new Promise((resolve) => {
			setTimeout(resolve, 3000);
		});

		// Assert that no tasks were created
		const task = await ctx.kernel.query(ctx.logContext, ctx.session, {
			type: 'object',
			properties: {
				type: {
					const: 'task@1.0.0',
				},
				data: {
					type: 'object',
					required: ['status', 'transformer'],
					properties: {
						status: {
							const: 'pending',
						},
						transformer: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									const: transformer.id,
								},
							},
						},
					},
				},
			},
		});
		expect(task.length).toEqual(0);
	});

	test('should only create a task when a transformer matches the input for an updated contract', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Link the loop as the owner of the transformer
		await ctx.createLink(loop, transformer, 'owns', 'is owned by');

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: true,
					},
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Assert that the expected task contract was created
		const task = await ctx.waitForMatch({
			type: 'object',
			properties: {
				type: {
					const: 'task@1.0.0',
				},
				data: {
					type: 'object',
					required: ['status', 'transformer'],
					properties: {
						status: {
							const: 'pending',
						},
						transformer: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									const: transformer.id,
								},
							},
						},
					},
				},
			},
		});

		// Assert that the expected link contract was created
		await ctx.waitForMatch({
			type: 'object',
			properties: {
				type: {
					const: 'link@1.0.0',
				},
				name: {
					const: 'generated',
				},
				data: {
					type: 'object',
					required: ['inverseName', 'from', 'to'],
					properties: {
						inverseName: {
							const: 'was generated by',
						},
						from: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: transformer.id,
								},
								type: {
									const: transformer.type,
								},
							},
						},
						to: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: task.id,
								},
								type: {
									const: task.type,
								},
							},
						},
					},
				},
			},
		});
	});

	test('should not create a task when contract change is not relevant', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Link the loop as the owner of the transformer
		await ctx.createLink(loop, transformer, 'owns', 'is owned by');

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: true,
					},
					a: 1,
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Update the contract
		await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			contract,
			[
				{
					op: 'replace',
					path: '/data/a',
					value: 2,
				},
				{
					op: 'add',
					path: '/data/b',
					value: 3,
				},
			],
		);
		await ctx.flushAll(ctx.session);

		// Give the system a few seconds to run
		await new Promise((resolve) => {
			setTimeout(resolve, 3000);
		});

		// Assert than only one task contract were created
		const tasks = await ctx.kernel.query(ctx.logContext, ctx.session, {
			type: 'object',
			properties: {
				type: {
					const: 'task@1.0.0',
				},
				data: {
					type: 'object',
					required: ['status', 'transformer'],
					properties: {
						transformer: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									const: transformer.id,
								},
							},
						},
					},
				},
			},
		});
		expect(tasks.length).toBe(1);

		// Assert than only one link contract were created
		const links = await ctx.kernel.query(ctx.logContext, ctx.session, {
			type: 'object',
			properties: {
				type: {
					const: 'link@1.0.0',
				},
				name: {
					const: 'generated',
				},
				data: {
					type: 'object',
					required: ['inverseName', 'from', 'to'],
					properties: {
						inverseName: {
							const: 'was generated by',
						},
						from: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									const: transformer.id,
								},
								type: {
									const: transformer.type,
								},
							},
						},
						to: {
							type: 'object',
							required: ['type'],
							properties: {
								type: {
									const: 'task@1.0.0',
								},
							},
						},
					},
				},
			},
		});
		expect(links.length).toBe(1);
	});

	test('should not create a task if a transformer doesnt have an owner', async () => {
		// Insert a new transformer
		const transformer = await ctx.worker.insertCard<TransformerContract>(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['transformer@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			{
				slug: autumndbTestUtils.generateRandomSlug({
					prefix: 'transformer',
				}),
				type: ctx.worker.typeContracts['transformer@1.0.0'].type,
				active: true,
				version: '1.0.0',
				data: {
					inputFilter: {
						type: 'object',
						properties: {
							name: {
								type: 'string',
								const: 'baz',
							},
						},
					},
					$transformer: {
						artifactReady: true,
					},
					workerFilter: {},
					requirements: {},
				},
			},
		);
		assert(transformer);

		// Wait for the stream to update the worker
		await ctx.retry(
			() => {
				return _.concat(
					_.filter(ctx.worker.transformers, { id: transformer.id }),
					_.filter(ctx.worker.latestTransformers, { id: transformer.id }),
				);
			},
			(matches: TransformerContract[]) => {
				return matches.length === 2;
			},
			30,
		);

		// Insert a new contract
		const contract = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{},
			{
				slug: autumndbTestUtils.generateRandomId(),
				type: 'card@1.0.0',
				markers: [],
				data: {
					$transformer: {
						artifactReady: false,
					},
				},
			},
		);
		assert(contract);
		await ctx.flushAll(ctx.session);

		// Update the contract
		await ctx.worker.patchCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				actor: ctx.adminUserId,
			},
			contract,
			[
				{
					op: 'replace',
					path: '/data/$transformer/artifactReady',
					value: true,
				},
			],
		);
		await ctx.flushAll(ctx.session);

		// Give the system a few seconds to run just in case
		await new Promise((resolve) => {
			setTimeout(resolve, 3000);
		});

		// Assert that no tasks were created
		const task = await ctx.kernel.query(ctx.logContext, ctx.session, {
			type: 'object',
			properties: {
				type: {
					const: 'task@1.0.0',
				},
				data: {
					type: 'object',
					required: ['status', 'transformer'],
					properties: {
						status: {
							const: 'pending',
						},
						transformer: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									const: transformer.id,
								},
							},
						},
					},
				},
			},
		});
		expect(task.length).toEqual(0);
	});
});

async function createTaskRelationships() {
	const relationshipTypeContract =
		ctx.worker.typeContracts['relationship@1.0.0'];
	const cardOwnsTask: RelationshipContractDefinition = {
		slug: `relationship-card-owns-task`,
		type: 'relationship@1.0.0',
		name: 'owns',
		data: {
			inverseName: 'is owned by',
			title: 'Card',
			inverseTitle: 'Task',
			from: {
				type: 'card',
			},
			to: {
				type: `task`,
			},
		},
	};

	await ctx.worker.replaceCard(
		ctx.logContext,
		ctx.session,
		relationshipTypeContract,
		{
			attachEvents: false,
		},
		cardOwnsTask,
	);

	const typeOwnsTask: RelationshipContractDefinition = {
		slug: `relationship-type-owns-task`,
		type: 'relationship@1.0.0',
		name: 'owns',
		data: {
			inverseName: 'is owned by',
			title: 'Type',
			inverseTitle: 'Task',
			from: {
				type: 'type',
			},
			to: {
				type: `task`,
			},
		},
	};

	await ctx.worker.replaceCard(
		ctx.logContext,
		ctx.session,
		relationshipTypeContract,
		{
			attachEvents: false,
		},
		typeOwnsTask,
	);
}
