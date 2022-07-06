/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from 'autumndb';

export type Email = string;
/**
 * @minItems 1
 */
export type Email1 = string[];

export interface ContactData {
	source?: string;
	profile?: {
		email?: Email | Email1;
		company?: string;
		title?: string;
		type?: string;
		country?: string;
		city?: string;
		name?: {
			first?: string;
			last?: string;
			[k: string]: unknown;
		};
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface ContactContractDefinition
	extends ContractDefinition<ContactData> {}

export interface ContactContract extends Contract<ContactData> {}
