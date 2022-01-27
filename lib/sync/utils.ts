import axios, { AxiosError, Method } from 'axios';
import jsone from 'json-e';
import * as assert from '@balena/jellyfish-assert';
import * as errors from './errors';
import _ from 'lodash';
import { SyncActionContext } from './context';
import { Contract } from '@balena/jellyfish-types/build/core';
import axiosRetry from 'axios-retry';

/**
 * @summary Evaluate $eval attributes in an object based on the provided context.
 * @function
 * @private
 *
 * @param {Object} object - object
 * @param {Object} context - context
 * @returns {(Object|null)} evaluated object
 *
 * @example
 * const result = evaluateObjectWithContext({
 *   foo: {
 *     $eval: 'hello'
 *   }
 * }, {
 *   hello: 1
 * })
 *
 * console.log(result)
 * > {
 * >   foo: 1
 * > }
 */
export const evaluateObjectWithContext = (object: any, context: any) => {
	if (!object) {
		return object;
	}

	if (object.$eval) {
		try {
			return jsone(object, context);
		} catch (error: any) {
			if (error.name === 'InterpreterError') {
				return null;
			}

			throw error;
		}
	}

	for (const key of Object.keys(object)) {
		// For performance reasons
		// eslint-disable-next-line lodash/prefer-lodash-typecheck
		if (typeof object[key] !== 'object' || object[key] === null) {
			continue;
		}

		const result = evaluateObjectWithContext(object[key], context);
		if (!result) {
			return null;
		}

		object[key] = result;
	}

	return object;
};

export const httpRequest = async <T = any>(
	options: {
		method: Method;
		baseUrl: string;
		json?: boolean;
		uri: string;
		headers?: {
			[key: string]: string;
		};
		data?: {
			[key: string]: any;
		};
	},
	retries = 30,
): Promise<{ code: number; body: T }> => {
	const client = axios.create({
		method: options.method,
		baseURL: options.baseUrl,
		url: options.uri,
		headers: options.headers || {},
		data: options.data || {},
	});

	axiosRetry(client, {
		retries,
		retryCondition: (error: AxiosError) => {
			if (axios.isAxiosError(error) && error.response) {
				if (error.response.status >= 500) {
					return true;
				}
			} else if (
				error.response!.status === 429 ||
				error.response!.status === 408
			) {
				return true;
			}
			return false;
		},
		retryDelay: (_count: number, error: AxiosError) => {
			if (axios.isAxiosError(error) && error.response) {
				if (error.response.status >= 500) {
					return 2000;
				}
			} else if (
				error.response!.status === 429 ||
				error.response!.status === 408
			) {
				return 5000;
			}
			return 1000;
		},
	});

	try {
		const result = await client.request({});
		return {
			code: result.status,
			body: result.data,
		};
	} catch (error: any) {
		return {
			code: error.response.status,
			body: error.response.data,
		};
	}
};

export const getOAuthUser = async (
	context: {
		getElementById: (arg0: any) => any;
		getElementBySlug: (arg0: string, arg1?: boolean) => any;
	},
	provider: any,
	actor: any,
	options: { defaultUser: any },
) => {
	const userCard = await context.getElementById(actor);
	assert.INTERNAL(
		null,
		userCard,
		errors.SyncNoActor,
		`No such actor: ${actor}`,
	);

	const tokenPath = ['data', 'oauth', provider];
	if (_.has(userCard, tokenPath)) {
		return userCard;
	}

	assert.INTERNAL(
		null,
		options.defaultUser,
		errors.SyncOAuthNoUserError,
		`No default integrations actor to act as ${actor} for ${provider}`,
	);

	const defaultUserCard = await context.getElementBySlug(
		`user-${options.defaultUser}@latest`,
		true,
	);

	assert.INTERNAL(
		null,
		defaultUserCard,
		errors.SyncNoActor,
		`No such actor: ${options.defaultUser}`,
	);

	assert.USER(
		null,
		_.has(defaultUserCard, tokenPath),
		errors.SyncOAuthNoUserError,
		`Default actor ${options.defaultUser} does not support ${provider}`,
	);

	return defaultUserCard;
};

export const setContractProperty = (
	contract: any,
	object: any,
	path: _.Many<string | number | symbol>,
) => {
	if (_.has(object, path)) {
		_.set(contract, path, _.get(object, path) || _.get(contract, path));
	}
};

export const getOrCreateActorContractFromFragment = async (
	context: SyncActionContext,
	fragment: Partial<Contract> & { type: string },
) => {
	// TODO: Attempt to unify user cards based on
	// their e-mails. i.e. if two user cards have
	// the same e-mail then they are likely the
	// same user.
	const contract = await context.getElementBySlug(
		`${fragment.slug}@${fragment.version}`,
	);
	if (contract) {
		// Set union of all known e-mails
		const emailPropertyPath = ['data', 'email'];
		if (_.has(fragment, emailPropertyPath)) {
			const emails = _.sortBy(
				_.compact(
					_.union(
						_.castArray(_.get(contract, emailPropertyPath)),
						_.castArray(_.get(fragment, emailPropertyPath)),
					),
				),
			);
			_.set(
				contract,
				emailPropertyPath,
				emails.length === 1 ? _.first(emails) : emails,
			);
		}

		setContractProperty(contract, fragment, ['data', 'profile', 'company']);
		setContractProperty(contract, fragment, [
			'data',
			'profile',
			'name',
			'first',
		]);
		setContractProperty(contract, fragment, [
			'data',
			'profile',
			'name',
			'last',
		]);
		setContractProperty(contract, fragment, ['data', 'profile', 'title']);
		setContractProperty(contract, fragment, ['data', 'profile', 'country']);
		setContractProperty(contract, fragment, ['data', 'profile', 'city']);

		context.log.info('Unifying actor contracts', {
			target: contract,
			source: fragment,
		});

		await context.upsertElement(contract.type, _.omit(contract, ['type']), {
			timestamp: new Date(),
		});

		return contract.id;
	}

	context.log.info('Creating new actor', {
		slug: fragment.slug,
		data: fragment.data,
	});

	const result = await context.upsertElement(
		fragment.type,
		_.omit(fragment, ['type']),
		{
			timestamp: new Date(),
		},
	);

	// The result of an upsert might be null if the upsert
	// didn't change anything (a no-op update), so in that
	// case we can fetch the user contract from the database.
	if (!result) {
		const existentCard = await context.getElementBySlug(
			`${fragment.slug}@${fragment.version}`,
		);

		// If the contract can't be loaded something weird has happened
		if (!existentCard) {
			throw Error(
				`Upsert returned null, but can't retrieve contract: ${fragment.slug}@${fragment.version}`,
			);
		}

		return existentCard.id;
	}

	return result.id;
};
