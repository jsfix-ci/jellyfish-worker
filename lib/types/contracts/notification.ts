/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from 'autumndb';

export interface NotificationData {
	status?: 'open' | 'archived';
	[k: string]: unknown;
}

export interface NotificationContractDefinition
	extends ContractDefinition<NotificationData> {}

export interface NotificationContract extends Contract<NotificationData> {}
