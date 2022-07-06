/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from 'autumndb';

export type TriggeredActionData = TriggeredActionData1 & TriggeredActionData2;
export type TriggeredActionData2 = {
	[k: string]: unknown;
};

export interface TriggeredActionData1 {
	mode?: 'insert' | 'update';
	type?: string;
	startDate?: string;
	interval?: string;
	filter?: {
		[k: string]: unknown;
	};
	action?: string;
	target?:
		| string
		| {
				[k: string]: unknown;
		  }
		| string[];
	arguments?: {
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface TriggeredActionContractDefinition
	extends ContractDefinition<TriggeredActionData> {}

export interface TriggeredActionContract
	extends Contract<TriggeredActionData> {}
