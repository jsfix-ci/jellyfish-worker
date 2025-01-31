/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from 'autumndb';

export interface ChannelData {
	/**
	 * Contracts matching this filter will be handled by the channel
	 */
	filter: {
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface ChannelContractDefinition
	extends ContractDefinition<ChannelData> {}

export interface ChannelContract extends Contract<ChannelData> {}
