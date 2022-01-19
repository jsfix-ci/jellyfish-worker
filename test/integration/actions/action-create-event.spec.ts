import { strict as assert } from 'assert';
import {
	errors as coreErrors,
	Kernel,
	testUtils as coreTestUtils,
} from '@balena/jellyfish-core';
import { testUtils, WorkerContext } from '../../../lib';
import { actionCreateEvent } from '../../../lib/actions/action-create-event';

let ctx: testUtils.TestContext;
let actionContext: WorkerContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
	actionContext = ctx.worker.getActionContext(ctx.logContext);
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('action-create-event', () => {
	test('should throw an error on invalid type', async () => {
		const card = await ctx.createContract(
			ctx.adminUserId,
			ctx.session,
			'card@1.0.0',
			coreTestUtils.generateRandomSlug(),
			{ payload: 'test' },
		);
		const request = {
			context: {
				id: `TEST-${coreTestUtils.generateRandomId()}`,
			},
			timestamp: new Date().toISOString(),
			actor: ctx.adminUserId,
			originator: coreTestUtils.generateRandomId(),
			arguments: {
				type: 'foobar',
				payload: card.data.payload,
			},
		};

		await expect(
			actionCreateEvent.handler(
				ctx.session,
				actionContext,
				card,
				request as any,
			),
		).rejects.toThrow(`No such type: ${request.arguments.type}`);
	});

	test('should return event card', async () => {
		const card = await ctx.createContract(
			ctx.adminUserId,
			ctx.session,
			'card@1.0.0',
			coreTestUtils.generateRandomSlug(),
			{ payload: 'test' },
		);
		const request = {
			context: {
				id: `TEST-${coreTestUtils.generateRandomId()}`,
			},
			timestamp: new Date().toISOString(),
			actor: ctx.adminUserId,
			originator: coreTestUtils.generateRandomId(),
			arguments: {
				type: 'card',
				payload: card.data.payload,
			},
		};

		const results = await actionCreateEvent.handler(
			ctx.session,
			actionContext,
			card,
			request as any,
		);
		expect((results as any).slug).toMatch(/^card-/);
	});

	test('should throw an error on attempt to insert existing card', async () => {
		const card = await ctx.createContract(
			ctx.adminUserId,
			ctx.session,
			'card@1.0.0',
			coreTestUtils.generateRandomSlug(),
			{ payload: 'test' },
		);
		const request = {
			context: {
				id: `TEST-${coreTestUtils.generateRandomId()}`,
			},
			timestamp: new Date().toISOString(),
			actor: ctx.adminUserId,
			originator: coreTestUtils.generateRandomId(),
			arguments: {
				type: 'card',
				slug: card.slug,
				payload: card.data.payload,
			},
		};

		await expect(
			actionCreateEvent.handler(
				ctx.session,
				actionContext,
				card,
				request as any,
			),
		).rejects.toThrow(coreErrors.JellyfishElementAlreadyExists);
	});

	test('should create a link card', async () => {
		const root = await ctx.createContract(
			ctx.adminUserId,
			ctx.session,
			'card@1.0.0',
			null,
			{ payload: 'test' },
		);

		const eventRequest = await ctx.queue.producer.enqueue(
			ctx.worker.getId(),
			ctx.session,
			{
				action: 'action-create-event@1.0.0',
				logContext: ctx.logContext,
				card: root.id,
				type: root.type,
				arguments: {
					type: 'card',
					tags: [],
					payload: {
						message: 'johndoe',
					},
				},
			},
		);
		await ctx.flushAll(ctx.session);
		const eventResult: any = await ctx.queue.producer.waitResults(
			ctx.logContext,
			eventRequest,
		);
		expect(eventResult.error).toBe(false);

		const [link] = await ctx.kernel.query(ctx.logContext, ctx.session, {
			type: 'object',
			properties: {
				type: {
					type: 'string',
					const: 'link@1.0.0',
				},
				data: {
					type: 'object',
					properties: {
						from: {
							type: 'object',
							properties: {
								id: {
									type: 'string',
									const: eventResult.data.id,
								},
							},
							required: ['id'],
						},
					},
					required: ['from'],
				},
			},
			required: ['type', 'data'],
			additionalProperties: true,
		});

		expect(link).toEqual(
			Kernel.defaults({
				created_at: link.created_at,
				id: link.id,
				slug: link.slug,
				name: 'is attached to',
				type: 'link@1.0.0',
				data: {
					inverseName: 'has attached element',
					from: {
						id: eventResult.data.id,
						type: 'card@1.0.0',
					},
					to: {
						id: root.id,
						type: root.type,
					},
				},
			}),
		);
	});

	test('should be able to add an event name', async () => {
		const root = await ctx.createContract(
			ctx.adminUserId,
			ctx.session,
			'card@1.0.0',
			null,
			{ payload: 'test' },
		);

		const eventRequest = await ctx.queue.producer.enqueue(
			ctx.worker.getId(),
			ctx.session,
			{
				action: 'action-create-event@1.0.0',
				logContext: ctx.logContext,
				card: root.id,
				type: root.type,
				arguments: {
					type: 'card',
					name: 'Hello world',
					tags: [],
					payload: {
						message: 'johndoe',
					},
				},
			},
		);
		await ctx.flushAll(ctx.session);
		const eventResult: any = await ctx.queue.producer.waitResults(
			ctx.logContext,
			eventRequest,
		);
		expect(eventResult.error).toBe(false);

		const event = await ctx.kernel.getContractById(
			ctx.logContext,
			ctx.session,
			eventResult.data.id,
		);
		assert(event);
		expect(event.name).toBe('Hello world');
	});

	test("events should always inherit their parent's markers", async () => {
		const marker = 'org-test';
		const card = await ctx.worker.insertCard(
			ctx.logContext,
			ctx.session,
			ctx.worker.typeContracts['card@1.0.0'],
			{
				attachEvents: true,
				actor: ctx.adminUserId,
			},
			{
				name: coreTestUtils.generateRandomSlug(),
				slug: coreTestUtils.generateRandomSlug({
					prefix: 'card',
				}),
				version: '1.0.0',
				markers: [marker],
				data: {
					status: 'open',
				},
			},
		);
		assert(card);

		const request = await ctx.queue.producer.enqueue(
			ctx.worker.getId(),
			ctx.session,
			{
				action: 'action-create-event@1.0.0',
				logContext: ctx.logContext,
				card: card.id,
				type: card.type,
				arguments: {
					type: 'card',
					tags: [],
					payload: {
						message: 'johndoe',
					},
				},
			},
		);
		await ctx.flushAll(ctx.session);
		const cardResult: any = await ctx.queue.producer.waitResults(
			ctx.logContext,
			request,
		);
		expect(cardResult.error).toBe(false);

		const result = await ctx.kernel.getContractById(
			ctx.logContext,
			ctx.session,
			cardResult.data.id,
		);
		assert(result);
		expect(result.markers).toEqual([marker]);
	});
});
