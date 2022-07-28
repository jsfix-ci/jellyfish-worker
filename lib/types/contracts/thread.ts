/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from 'autumndb';

export interface ThreadData {
	description?: string;
	/**
	 * If true, indicates that this thread is used for direct messaging between users
	 */
	dms?: boolean;
	/**
	 * If this is a direct message thread, this field should contrain an array of slugs, for each of the participating users
	 */
	actors?: string[];
	participants?: unknown[];
	mentionsUser?: unknown[];
	alertsUser?: unknown[];
	mentionsGroup?: unknown[];
	alertsGroup?: unknown[];
	[k: string]: unknown;
}

export interface ThreadContractDefinition
	extends ContractDefinition<ThreadData> {}

export interface ThreadContract extends Contract<ThreadData> {}
