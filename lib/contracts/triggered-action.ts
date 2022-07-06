import type { ContractDefinition } from 'autumndb';

export const triggeredAction: ContractDefinition = {
	slug: 'triggered-action',
	type: 'type@1.0.0',
	version: '1.0.0',
	name: 'Jellyfish Triggered Action',
	markers: [],
	tags: [],
	active: true,
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^triggered-action-[a-z0-9-]+$',
				},
				data: {
					type: 'object',
					properties: {
						mode: {
							type: 'string',
							enum: ['insert', 'update'],
						},
						type: {
							type: 'string',
							pattern: '^[a-z0-9-]+@\\d+(\\.\\d+)?(\\.\\d+)?',
						},
						startDate: {
							type: 'string',
							format: 'date-time',
						},
						interval: {
							type: 'string',
							pattern:
								'^P(?!$)(\\d+Y)?(\\d+M)?(\\d+W)?(\\d+D)?(T(?=\\d)(\\d+H)?(\\d+M)?(\\d+S)?)?$',
						},
						filter: {
							type: 'object',
						},
						action: {
							type: 'string',
						},
						target: {
							type: ['string', 'object', 'array'],
							items: {
								type: 'string',
							},
							uniqueItems: true,
						},
						arguments: {
							type: 'object',
						},
					},
					oneOf: [
						{
							required: ['filter', 'action', 'target', 'arguments'],
						},
						{
							required: ['interval', 'action', 'target', 'arguments'],
						},
					],
				},
			},
			required: ['slug', 'data'],
		},
	},
	requires: [],
	capabilities: [],
};
