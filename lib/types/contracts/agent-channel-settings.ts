/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from 'autumndb';

export interface AgentChannelSettingsData {
	/**
	 * Opt-in to own the next available channel contract
	 */
	optIn?: boolean;
	[k: string]: unknown;
}

export interface AgentChannelSettingsContractDefinition
	extends ContractDefinition<AgentChannelSettingsData> {}

export interface AgentChannelSettingsContract
	extends Contract<AgentChannelSettingsData> {}
