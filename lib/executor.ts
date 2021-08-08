/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import Bluebird from 'bluebird';
import * as errio from 'errio';
import * as _ from 'lodash';
import * as skhema from 'skhema';
import * as fastEquals from 'fast-equals';
import * as utils from './utils';
import * as errors from './errors';
import * as transformers from './transformers';
import * as subscriptions from './subscriptions';
import * as triggers from './triggers';
import * as assert from '@balena/jellyfish-assert';
import * as jellyscript from '@balena/jellyfish-jellyscript';
import { getLogger } from '@balena/jellyfish-logger';
import { Operation } from 'fast-json-patch';
import { LogContext, EnqueueOptions, WorkerContext } from './types';
import { core, worker } from '@balena/jellyfish-types';
import { Kernel } from '@balena/jellyfish-core/build/kernel';
import { TriggeredActionContract } from '@balena/jellyfish-types/build/worker';

const logger = getLogger('worker');

/**
 * @summary The "type" card type
 * @type {String}
 * @private
 */
const CARD_TYPE_TYPE = 'type@1.0.0';

/**
 * @summary Default insert concurrency
 * @type {Number}
 * @private
 */
const INSERT_CONCURRENCY = 3;

/**
 * @summary Get the request input card
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} jellyfish - jellyfish instance
 * @param {String} session - session id
 * @param {String} identifier - id or slug
 * @returns {(Object|Null)}
 *
 * @example
 * const card = await getInputCard({ ... }, jellyfish, session, 'foo-bar')
 * if (card) {
 *   console.log(card)
 * }
 */
const getInputCard = async (
	context: LogContext,
	jellyfish: Kernel,
	session: string,
	identifier: string,
): Promise<core.Contract | null> => {
	if (identifier.includes('@')) {
		return jellyfish.getCardBySlug(context, session, identifier);
	}
	return jellyfish.getCardById(context, session, identifier);
};

/**
 * @summary A pipeline function that runs standard logic for all contract
 * operations ran through the worker
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} jellyfish - jellyfish kernel instance
 * @param {String} session - session id
 * @param {Object} typeCard - The full type contract for the card being
 * inserted or updated
 * @param {Object} current - The full contract prior to being updated, if it exists
 * @param {Object} options - Options object
 * @param {Function} fn - an asynchronous function that will perform the operation
 */
// TS-TODO: Improve the tpyings for the `options` parameter
const commit = async (
	context: LogContext,
	jellyfish: Kernel,
	session: string,
	typeCard: core.TypeContract,
	current: core.Contract | null,
	options: {
		transformers: any;
		typeContracts: { [key: string]: core.TypeContract };
		context: { privilegedSession: string };
		executeAction: (arg0: any, arg1: EnqueueOptions) => any;
		waitResults: (arg0: LogContext, arg1: any) => any;
		subscriptions: core.Contract[];
		triggers: any[];
		currentTime: Date;
		actor: any;
		originator: any;
		library: {
			[x: string]: {
				handler: (
					session: string,
					// Worker context?
					context: any,
					contract: core.Contract<core.ContractData>,
					request: {
						action: string;
						card: core.Contract<core.ContractData>;
						actor: string;
						context: LogContext;
						timestamp: any;
						epoch: any;
						arguments: { name: any; type: any; payload: any; tags: never[] };
					},
				) => any;
			};
		};
		attachEvents: any;
		timestamp: string | number | Date;
		reason: any;
		eventType: any;
		eventPayload: any;
		setTriggers: (arg0: LogContext, arg1: any) => any;
	},
	fn: () => Promise<core.Contract>,
) => {
	assert.INTERNAL(
		context,
		typeCard && typeCard.data && typeCard.data.schema,
		errors.WorkerNoElement,
		`Invalid type: ${typeCard}`,
	);

	const insertedCard = await fn();
	if (!insertedCard) {
		return null;
	}

	if (
		current !== null &&
		fastEquals.deepEqual(
			_.omit(insertedCard, ['created_at', 'updated_at', 'linked_at', 'links']),
			_.omit(current, ['created_at', 'updated_at', 'linked_at', 'links']),
		)
	) {
		logger.debug(context, 'Omitting pointless insertion', {
			slug: current.slug,
		});

		return null;
	}

	if (options.transformers) {
		transformers.evaluate({
			transformers: options.transformers,
			oldCard: current,
			newCard: insertedCard,
			context,
			query: (querySchema, queryOpts) => {
				return jellyfish.query(
					context,
					options.context.privilegedSession,
					querySchema,
					queryOpts,
				);
			},
			executeAndAwaitAction: async (actionRequest) => {
				actionRequest.context = context;
				const req = await options.executeAction(
					options.context.privilegedSession,
					actionRequest,
				);

				const result = await options.waitResults(context, req);

				return result;
			},
		});
	}

	subscriptions
		.evaluate({
			oldContract: current,
			newContract: insertedCard,
			getTypeContract: (type) => {
				return options.typeContracts[type];
			},
			getSession: async (userId: string) => {
				return utils.getActorKey(
					context,
					jellyfish,
					options.context.privilegedSession,
					userId,
				);
			},
			insertContract: async (
				insertedContractType: core.TypeContract,
				actorSession: string,
				object: any,
			) => {
				return insertCard(
					context,
					jellyfish,
					actorSession,
					insertedContractType,
					{
						...options,
						attachEvents: true,
						timestamp: Date.now(),
					},
					object,
				);
			},
			query: (querySchema, queryOpts = {}) => {
				return jellyfish.query(
					context,
					options.context.privilegedSession,
					querySchema,
					queryOpts,
				);
			},
			getContractById: (id: string) => {
				return jellyfish.getCardById(context, session, id);
			},
		})
		.catch((error) => {
			const errorObject = errio.toObject(error, {
				stack: true,
			});

			const logData = {
				error: errorObject,
				input: insertedCard.slug,
			};

			if (error.expected) {
				logger.warn(context, 'Execute error in subscriptions', logData);
			} else {
				logger.error(context, 'Execute error', logData);
			}
		});

	if (options.triggers) {
		const runTrigger = async (trigger: TriggeredActionContract) => {
			// Ignore triggered actions whose start date is in the future
			if (
				options.currentTime.getTime() < triggers.getStartDate(trigger).getTime()
			) {
				return null;
			}

			const request = await triggers.getRequest(
				jellyfish,
				trigger,
				insertedCard,
				{
					currentDate: new Date(),
					mode: current ? 'update' : 'insert',
					context,
					session,
				},
			);

			if (!request) {
				return null;
			}

			// trigger.target might result in multiple cards in a single action request
			const identifiers = _.uniq(_.castArray(request.card));

			const triggerCards = await Bluebird.map(
				identifiers,
				async (identifier) => {
					const triggerCard = await getInputCard(
						context,
						jellyfish,
						session,
						identifier,
					);
					assert.INTERNAL(
						context,
						triggerCard,
						errors.WorkerNoElement,
						`No such input card for trigger ${trigger.slug}: ${identifier}`,
					);
					return triggerCard;
				},
			);

			return Promise.all(
				triggerCards.map((triggerCard) => {
					// TODO: improve this gaurd
					if (!triggerCard) {
						return;
					}
					const actionRequest = {
						// Re-enqueuing an action request expects the "card" option to be an
						// id, not a full card.
						card: triggerCard.id,
						action: request.action!,
						actor: options.actor,
						context: request.context,
						timestamp: request.currentDate.toISOString(),
						epoch: request.currentDate.valueOf(),
						arguments: request.arguments,

						// Carry the old originator if present so we
						// don't break the chain
						originator: options.originator || request.originator,
					};

					logger.info(
						context,
						'Enqueing new action request due to triggered-action',
						{
							trigger: trigger.slug,
							contract: triggerCard.id,
							arguments: request.arguments,
						},
					);

					return options.executeAction(session, actionRequest);
				}),
			);
		};

		await Bluebird.map(options.triggers, (trigger) => {
			return runTrigger(trigger).catch((error) => {
				const errorObject = errio.toObject(error, {
					stack: true,
				});

				const logData = {
					error: errorObject,
					input: insertedCard.slug,
					trigger: trigger.slug,
				};

				if (error.expected) {
					logger.warn(
						context,
						'Execute error in asynchronous trigger',
						logData,
					);
				} else {
					logger.error(context, 'Execute error', logData);
				}
			});
		});
	}

	if (options.attachEvents) {
		const time = options.timestamp
			? new Date(options.timestamp)
			: options.currentTime;

		const request = {
			action: 'action-create-event@1.0.0',
			card: insertedCard,
			actor: options.actor,
			context,
			timestamp: time.toISOString(),
			epoch: time.valueOf(),
			arguments: {
				name: options.reason,
				type: options.eventType,
				payload: options.eventPayload,
				tags: [],
			},
		};

		await options.library[request.action.split('@')[0]].handler(
			session,
			options.context,
			insertedCard,
			request as any,
		);
	}

	// If the card markers have changed then update the timeline of the card
	if (current && !fastEquals.deepEqual(current.markers, insertedCard.markers)) {
		const timeline = await jellyfish.query(context, session, {
			$$links: {
				'is attached to': {
					type: 'object',
					required: ['slug', 'type'],
					properties: {
						slug: {
							type: 'string',
							const: insertedCard.slug,
						},
						type: {
							type: 'string',
							const: insertedCard.type,
						},
					},
				},
			},
			type: 'object',
			required: ['slug', 'version', 'type'],
			properties: {
				slug: {
					type: 'string',
				},
				version: {
					type: 'string',
				},
				type: {
					type: 'string',
				},
			},
		});

		for (const event of timeline) {
			if (!fastEquals.deepEqual(event.markers, insertedCard.markers)) {
				await jellyfish.patchCardBySlug(
					context,
					session,
					`${event.slug}@${event.version}`,
					[
						{
							op: 'replace',
							path: '/markers',
							value: insertedCard.markers,
						},
					],
				);
			}
		}
	}

	if (insertedCard.type === CARD_TYPE_TYPE) {
		// Remove any previously attached trigger for this type
		const typeTriggers = await triggers.getTypeTriggers(
			context,
			jellyfish,
			session,
			`${insertedCard.slug}@${insertedCard.version}`,
		);
		await Bluebird.map(
			typeTriggers,
			async (trigger) => {
				await jellyfish.patchCardBySlug(
					context,
					session,
					`${trigger.slug}@${trigger.version}`,
					[
						{
							op: 'replace',
							path: '/active',
							value: false,
						},
					],
				);

				// Also from the locally cached triggers
				_.remove(options.triggers, {
					id: trigger.id,
				});
			},
			{
				concurrency: INSERT_CONCURRENCY,
			},
		);

		await Bluebird.map(
			jellyscript.getTypeTriggers(
				insertedCard,
			) as worker.TriggeredActionContract[],
			async (trigger) => {
				// We don't want to use the actions queue here
				// so that watchers are applied right away
				const triggeredActionContract = await jellyfish.replaceCard(
					context,
					session,
					trigger,
				);

				// Registered the newly created trigger
				// right away for performance reasons
				return options.setTriggers(
					context,
					options.triggers.concat([triggeredActionContract]),
				);
			},
			{
				concurrency: INSERT_CONCURRENCY,
			},
		);
	}

	return insertedCard;
};

/**
 * @summary Insert a card in the system
 * @function
 * @public
 *
 * @param {Object} context - worker execution context
 * @param {Object} jellyfish - jellyfish instance
 * @param {String} session - session id
 * @param {Object} typeCard - type card
 * @param {Object} options - options
 * @param {Date} options.currentTime - current time
 * @param {Date} [options.timestamp] - Upsert timestamp
 * @param {Boolean} options.attachEvents - attach create/update events
 * @param {Function} options.executeAction - execute action function (session, request)
 * @param {Object[]} [options.triggers] - known triggered action
 * @param {Object} object - card properties
 * @returns {Object} inserted card
 *
 * @example
 * const session = '4a962ad9-20b5-4dd8-a707-bf819593cc84'
 * const typeCard = await jellyfish.getCardBySlug(session, 'card')
 *
 * const result = await executor.insertCard({ ... }, jellyfish, session, typeCard, {
 *   attachEvents: true,
 *   currentTime: new Date(),
 *   triggers: [ ... ],
 *   executeAction: async (session, request) => {
 *     ...
 *   }
 * }, {
 *   slug: 'foo',
 *   data: {
 *     bar: 'baz'
 *   }
 * })
 *
 * console.log(result.id)
 */
export const insertCard = async (
	context: LogContext,
	jellyfish: Kernel,
	session: string,
	typeCard: core.TypeContract,
	// TS-TODO: correctly type this
	options: any,
	object: Partial<core.Contract>,
) => {
	options.triggers = options.triggers || [];

	logger.debug(context, 'Inserting card', {
		slug: object.slug,
		type: typeCard.slug,
		attachEvents: options.attachEvents,
		triggers: options.triggers.length,
	});

	object.type = `${typeCard.slug}@${typeCard.version}`;

	let card: core.Contract | null = null;
	if (object.slug) {
		card = await jellyfish.getCardBySlug(
			context,
			session,
			`${object.slug}@${object.version || 'latest'}`,
		);
	}
	if (!card && object.id) {
		card = await jellyfish.getCardById(context, session, object.id);
	}

	if (typeof object.name !== 'string') {
		Reflect.deleteProperty(object, 'name');
	}

	options.eventPayload = _.omit(object, ['id']);
	options.eventType = 'create';

	return commit(
		context,
		jellyfish,
		session,
		typeCard,
		card,
		options,
		async () => {
			// TS-TODO: Fix these "any" castings
			const objectWithLinks = await getObjectWithLinks(
				context,
				jellyfish,
				session,
				object,
				typeCard,
			);
			const result = jellyscript.evaluateObject(
				typeCard.data.schema,
				objectWithLinks as any,
			);
			return jellyfish.insertCard(context, session, result as any);
		},
	);
};

export const replaceCard = async (
	context: LogContext,
	jellyfish: Kernel,
	session: string,
	typeCard: core.TypeContract,
	// TS-TODO: correctly type this options object
	options: any,
	object: Partial<core.Contract>,
): Promise<core.Contract | null> => {
	options.triggers = options.triggers || [];

	logger.debug(context, 'Replacing card', {
		slug: object.slug,
		type: typeCard.slug,
		attachEvents: options.attachEvents,
		triggers: options.triggers.length,
	});

	object.type = `${typeCard.slug}@${typeCard.version}`;

	let card: core.Contract | null = null;
	if (object.slug) {
		card = await jellyfish.getCardBySlug(
			context,
			session,
			`${object.slug}@${object.version}`,
		);
	}
	if (!card && object.id) {
		card = await jellyfish.getCardById(context, session, object.id);
	}

	if (typeof object.name !== 'string') {
		Reflect.deleteProperty(object, 'name');
	}

	if (card) {
		options.attachEvents = false;
	} else {
		options.eventPayload = _.omit(object, ['id']);
		options.eventType = 'create';
	}

	return commit(
		context,
		jellyfish,
		session,
		typeCard,
		card,
		options,
		async () => {
			// TS-TODO: Remove these `any` castings
			const objectWithLinks = await getObjectWithLinks(
				context,
				jellyfish,
				session,
				object,
				typeCard,
			);

			const result = jellyscript.evaluateObject(
				typeCard.data.schema,
				objectWithLinks as any,
			);
			return jellyfish.replaceCard(context, session, result as any);
		},
	);
};

export const patchCard = async (
	context: LogContext,
	jellyfish: Kernel,
	session: string,
	typeCard: core.TypeContract,
	// TS-TODO: correctly type this options object
	options: any,
	object: core.Contract,
	patch: Operation[],
) => {
	assert.INTERNAL(
		context,
		object.version,
		errors.WorkerInvalidVersion,
		`Can't update without a version for: ${object.slug}`,
	);

	options.triggers = options.triggers || [];

	logger.debug(context, 'Patching card', {
		slug: object.slug,
		version: object.version,
		type: typeCard.slug,
		attachEvents: options.attachEvents,
		operations: patch.length,
		triggers: options.triggers.length,
	});

	options.eventPayload = patch;
	options.eventType = 'update';

	return commit(
		context,
		jellyfish,
		session,
		typeCard,
		object,
		options,
		async () => {
			// TS-TODO: Remove these any castings
			const objectWithLinks = await getObjectWithLinks(
				context,
				jellyfish,
				session,
				object,
				typeCard,
			);
			const newPatch = jellyscript.evaluatePatch(
				typeCard.data.schema,
				objectWithLinks as any,
				patch,
			);
			return jellyfish.patchCardBySlug(
				context,
				session,
				`${object.slug}@${object.version}`,
				newPatch,
			);
		},
	);
};

/**
 * @summary Execute an action request
 * @function
 * @protected
 *
 * @param {Object} jellyfish - jellyfish instance
 * @param {String} session - session id
 * @param {Object} context - execution context
 * @param {Object} library - actions library
 * @param {Object} request - request
 * @param {String} request.actor - actor id
 * @param {Object} request.action - action card
 * @param {String} request.timestamp - action timestamp
 * @param {String} request.card - action input card id or slug
 * @param {Object} request.arguments - action arguments
 * @returns {Any} action result
 *
 * @example
 * const session = '4a962ad9-20b5-4dd8-a707-bf819593cc84'
 * const result = await executor.run(jellyfish, session, { ... }, { ... }, { ... })
 * console.log(result)
 */
export const run = async (
	jellyfish: Kernel,
	session: string,
	context: WorkerContext,
	// TS-TODO: type the action library
	library: { [x: string]: { handler: any } },
	// TS-TODO: type request param
	request: {
		context: LogContext;
		card: string;
		actor: string;
		action: core.ActionContract;
		arguments: any;
		timestamp: any;
		epoch?: any;
		type: string;
		originator?: string;
	},
) => {
	const cards = await Bluebird.props({
		input: getInputCard(request.context, jellyfish, session, request.card),
		actor: jellyfish.getCardById(request.context, session, request.actor),
	});

	assert.USER(
		request.context,
		cards.input,
		errors.WorkerNoElement,
		`No such input card: ${request.card}`,
	);
	assert.INTERNAL(
		request.context,
		cards.actor,
		errors.WorkerNoElement,
		`No such actor: ${request.actor}`,
	);

	const actionInputCardFilter = _.get(request.action, ['data', 'filter'], {
		type: 'object',
	});

	const results = skhema.match(actionInputCardFilter as any, cards.input);
	if (!results.valid) {
		logger.error(request.context, 'Card schema mismatch!');
		logger.error(request.context, JSON.stringify(actionInputCardFilter));
		for (const error of results.errors) {
			logger.error(request.context, error);
		}
	}

	assert.INTERNAL(
		request.context,
		// TS-TODO: Remove "any" casting
		skhema.isValid(actionInputCardFilter as any, cards.input),
		errors.WorkerSchemaMismatch,
		`Input card does not match filter. Action:${request.action.slug}, Card:${cards.input?.slug}`,
	);

	// TODO: Action definition bodies are not versioned yet
	// as they are not part of the action cards.
	const actionName = request.action.slug.split('@')[0];

	const argumentsSchema = utils.getActionArgumentsSchema(request.action);

	assert.USER(
		request.context,
		// TS-TODO: remove any casting
		skhema.isValid(argumentsSchema as any, request.arguments),
		errors.WorkerSchemaMismatch,
		() => {
			return `Arguments do not match for action ${actionName}: ${JSON.stringify(
				request.arguments,
				null,
				2,
			)}`;
		},
	);

	const actionFunction = library[actionName] && library[actionName].handler;
	assert.INTERNAL(
		request.context,
		actionFunction,
		errors.WorkerInvalidAction,
		`Unknown action function: ${actionName}`,
	);

	return actionFunction(session, context, cards.input, {
		action: request.action,
		card: request.card,
		actor: request.actor,
		context: request.context,
		timestamp: request.timestamp,
		epoch: request.epoch,
		arguments: request.arguments,
		originator: request.originator,
	});
};

/**
 * Returns an object that will include all links referenced in evaluated fields
 * in the type card's schema.
 *
 * If no links are referenced in evaluated fields, the original object is returned
 * immediately.
 *
 * @param {Object} context - execution context
 * @param {Object} jellyfish - jellyfish instance
 * @param {String} session - session id
 * @param {Object} card - card to fill with links
 * @param {Object} typeCard - type card
 *
 * @returns {Object} - the card with any links referenced in the evaluated fields
 * of it's type card's schema.
 */
async function getObjectWithLinks<
	PContract extends Partial<TContract> | TContract,
	TContract extends core.Contract<TData>,
	TData extends core.ContractData,
>(
	context: LogContext,
	jellyfish: Kernel,
	session: string,
	card: PContract,
	typeCard: core.TypeContract,
): Promise<PContract> {
	const linkVerbs = jellyscript.getReferencedLinkVerbs(typeCard);
	if (!linkVerbs.length) {
		return card;
	}
	let queriedCard: TContract | null = null;
	if ((card.slug && card.version) || card.id) {
		const query = utils.getQueryWithOptionalLinks(card, linkVerbs);
		[queriedCard] = await jellyfish.query<TContract>(context, session, query);
	}
	const cardWithLinks = queriedCard || card;

	// Optional links may not be populated so explicitly set to an empty array here
	linkVerbs.forEach((linkVerb) => {
		if (!_.has(cardWithLinks, ['links', linkVerb])) {
			_.set(cardWithLinks, ['links', linkVerb], []);
		}
	});

	return cardWithLinks as PContract;
}
