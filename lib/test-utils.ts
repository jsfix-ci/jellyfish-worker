import { strict as assert } from 'assert';
import { testUtils as coreTestUtils } from '@balena/jellyfish-core';
import { testUtils as queueTestUtils } from '@balena/jellyfish-queue';
import type {
	Contract,
	LinkContract,
	SessionContract,
	TypeContract,
	UserContract,
} from '@balena/jellyfish-types/build/core';
import _ from 'lodash';
import { ActionDefinition, Plugin } from './plugin';
import { PluginManager } from './plugin-manager';
import { Sync } from './sync';
import { Action, Map } from './types';
import { CARDS, Worker } from '.';

/**
 * Context that can be used in tests against the worker.
 */
export interface TestContext extends queueTestUtils.TestContext {
	worker: Worker;
	adminUserId: string;
	actionLibrary: Map<Action>;
	flush: (session: string) => Promise<null>;
	flushAll: (session: string) => Promise<void>;
	waitForMatch: <T extends Contract>(query: any, times?: number) => Promise<T>;
	processAction: (session: string, action: any) => Promise<any>;
	createEvent: (
		actor: string,
		session: string,
		target: Contract,
		body: string,
		type: string,
	) => Promise<any>;
	createUser: (
		username: string,
		hash?: string,
		roles?: string[],
	) => Promise<UserContract>;
	createSession: (user: UserContract) => Promise<SessionContract>;
	createLink: (
		actor: string,
		session: string,
		fromCard: Contract,
		toCard: Contract,
		verb: string,
		inverseVerb: string,
	) => Promise<LinkContract>;
	createContract: (
		actor: string,
		session: string,
		type: string,
		name: string | null,
		data: any,
		markers?: any,
	) => Promise<Contract>;
}

/**
 * Options accepted by `newContext`.
 */
export interface NewContextOptions extends coreTestUtils.NewContextOptions {
	/**
	 * Set of plugins needed to run tests.
	 */
	plugins?: Array<() => Plugin>;
	actions?: ActionDefinition[];
}

/**
 * Create a new `TestContext` with an initialized worker.
 */
export const newContext = async (
	options: NewContextOptions = {},
): Promise<TestContext> => {
	const queueTestContext = await queueTestUtils.newContext(options);

	const adminSessionContract = (await queueTestContext.kernel.getCardById(
		queueTestContext.logContext,
		queueTestContext.session,
		queueTestContext.session,
	)) as SessionContract;
	assert(adminSessionContract);

	// Initialize plugins.
	const pluginManager = new PluginManager(options.plugins || []);

	// Prepare and insert all contracts, including those from plugins.
	const contracts = pluginManager.getCards();
	const actionLibrary = pluginManager.getActions();
	if (options.actions) {
		for (const action of options.actions) {
			Object.assign(actionLibrary, {
				[action.contract.slug]: {
					handler: action.handler,
				},
			});
		}
	}
	const bootstrapContracts = [
		CARDS.create,
		CARDS.update,
		CARDS['triggered-action'],
		// Make sure any loop contracts are initialized, as they can be a prerequisite
		..._.filter(contracts, (contract) => {
			return contract.slug.startsWith('loop-');
		}),
		..._.filter(contracts, (contract) => {
			return contract.slug.startsWith('action-');
		}),
	];

	// Any remaining contracts from plugins can now be added to the sequence
	const remainder = _.filter(contracts, (contract) => {
		return !_.find(bootstrapContracts, { slug: contract.slug });
	});
	for (const contract of remainder) {
		bootstrapContracts.push(contract);
	}
	for (const contract of bootstrapContracts) {
		await queueTestContext.kernel.insertCard(
			queueTestContext.logContext,
			queueTestContext.session,
			contract,
		);
	}

	// Initialize sync.
	const sync = new Sync({
		integrations: pluginManager.getSyncIntegrations(),
	});

	// Initialize worker instance.
	const worker = new Worker(
		queueTestContext.kernel,
		queueTestContext.session,
		actionLibrary,
		queueTestContext.queue.consumer,
		queueTestContext.queue.producer,
	);
	await worker.initialize(queueTestContext.logContext, sync);

	const types = await queueTestContext.kernel.query<TypeContract>(
		queueTestContext.logContext,
		worker.session,
		{
			type: 'object',
			properties: {
				type: {
					const: 'type@1.0.0',
				},
			},
		},
	);
	worker.setTypeContracts(queueTestContext.logContext, types);

	// Update type cards through the worker for generated triggers, etc
	for (const contract of types) {
		await worker.replaceCard(
			queueTestContext.logContext,
			worker.session,
			worker.typeContracts['type@1.0.0'],
			{
				attachEvents: false,
			},
			contract,
		);
	}

	const triggers = await queueTestContext.kernel.query<TypeContract>(
		queueTestContext.logContext,
		worker.session,
		{
			type: 'object',
			properties: {
				type: {
					const: 'triggered-action@1.0.0',
				},
			},
		},
	);
	worker.setTriggers(queueTestContext.logContext, triggers);

	const flush = async (session: string) => {
		const request = await queueTestContext.dequeue();
		if (!request) {
			throw new Error('No message dequeued');
		}

		const result = await worker.execute(session, request);
		throw new Error(result.data.message);
	};

	const waitForMatch = async <T extends Contract>(
		waitQuery: any,
		times = 20,
	): Promise<T> => {
		if (times === 0) {
			throw new Error('The wait query did not resolve');
		}
		const results = await queueTestContext.kernel.query<T>(
			queueTestContext.logContext,
			queueTestContext.session,
			waitQuery,
		);
		if (results.length > 0) {
			return results[0];
		}
		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});
		return waitForMatch<T>(waitQuery, times - 1);
	};

	const flushAll = async (session: string) => {
		try {
			while (true) {
				await flush(session);
			}
		} catch {
			// Once an error is thrown, there are no more requests to dequeue.
			return;
		}
	};

	const processAction = async (session: string, action: any) => {
		const createRequest = await queueTestContext.queue.producer.enqueue(
			worker.getId(),
			session,
			action,
		);
		await flush(session);
		return queueTestContext.queue.producer.waitResults(
			queueTestContext.logContext,
			createRequest,
		);
	};

	const createEvent = async (
		actor: string,
		session: string,
		target: Contract,
		body: string,
		type: string,
	) => {
		const req = await queueTestContext.queue.producer.enqueue(actor, session, {
			action: 'action-create-event@1.0.0',
			logContext: queueTestContext.logContext,
			card: target.id,
			type: target.type,
			arguments: {
				type,
				payload: {
					message: body,
				},
			},
		});

		await flushAll(session);
		const result: any = await queueTestContext.queue.producer.waitResults(
			queueTestContext.logContext,
			req,
		);
		expect(result.error).toBe(false);
		assert(result.data);
		await flushAll(session);
		const contract = (await queueTestContext.kernel.getCardById(
			queueTestContext.logContext,
			queueTestContext.session,
			result.data.id,
		)) as Contract;
		assert(contract);

		return contract;
	};

	const createUser = async (
		username: string,
		hash = 'foobar',
		roles = ['user-community'],
	) => {
		// Create the user, only if it doesn't exist yet
		const userContract =
			(await queueTestContext.kernel.getCardBySlug<UserContract>(
				queueTestContext.logContext,
				queueTestContext.session,
				`user-${username}@latest`,
			)) ||
			(await queueTestContext.kernel.insertCard<UserContract>(
				queueTestContext.logContext,
				queueTestContext.session,
				{
					type: 'user@1.0.0',
					slug: `user-${username}`,
					data: {
						email: `${username}@example.com`,
						hash,
						roles,
					},
				},
			));
		assert(userContract);

		return userContract;
	};

	const createLink = async (
		actor: string,
		session: string,
		fromCard: Contract,
		toCard: Contract,
		verb: string,
		inverseVerb: string,
	) => {
		const inserted = await worker.insertCard(
			queueTestContext.logContext,
			session,
			worker.typeContracts['link@1.0.0'],
			{
				attachEvents: true,
				actor,
			},
			{
				slug: `link-${fromCard.id}-${verb.replace(/\s/g, '-')}-${
					toCard.id
				}-${coreTestUtils.generateRandomId()}`,
				tags: [],
				version: '1.0.0',
				links: {},
				requires: [],
				capabilities: [],
				active: true,
				name: verb,
				data: {
					inverseName: inverseVerb,
					from: {
						id: fromCard.id,
						type: fromCard.type,
					},
					to: {
						id: toCard.id,
						type: toCard.type,
					},
				},
			},
		);
		assert(inserted);
		await flushAll(session);

		const link = await queueTestContext.kernel.getCardById<LinkContract>(
			queueTestContext.logContext,
			queueTestContext.session,
			inserted.id,
		);
		assert(link);
		return link;
	};

	const createContract = async (
		actor: string,
		session: string,
		type: string,
		name: string | null,
		data: any,
		markers = [],
	) => {
		const inserted = await worker.insertCard(
			queueTestContext.logContext,
			session,
			worker.typeContracts[type],
			{
				attachEvents: true,
				actor,
			},
			{
				name,
				slug: coreTestUtils.generateRandomSlug({
					prefix: type.split('@')[0],
				}),
				version: '1.0.0',
				markers,
				data,
			},
		);
		assert(inserted);
		await flushAll(session);

		const contract = await queueTestContext.kernel.getCardById(
			queueTestContext.logContext,
			queueTestContext.session,
			inserted.id,
		);
		assert(contract);
		return contract;
	};

	const createSession = async (user: UserContract) => {
		// Force login, even if we don't know the password
		const sessionContract =
			await queueTestContext.kernel.insertCard<SessionContract>(
				queueTestContext.logContext,
				queueTestContext.session,
				{
					slug: `session-${
						user.slug
					}-integration-tests-${coreTestUtils.generateRandomId()}`,
					type: 'session@1.0.0',
					data: {
						actor: user.id,
					},
				},
			);
		assert(sessionContract);

		return sessionContract;
	};

	return {
		adminUserId: adminSessionContract.data.actor,
		actionLibrary,
		flush,
		waitForMatch,
		flushAll,
		processAction,
		createEvent,
		createUser,
		createSession,
		createLink,
		createContract,
		worker,
		...queueTestContext,
	};
};

/**
 * Deinitialize the queue.
 */
export const destroyContext = async (context: TestContext) => {
	await queueTestUtils.destroyContext(context);
};
