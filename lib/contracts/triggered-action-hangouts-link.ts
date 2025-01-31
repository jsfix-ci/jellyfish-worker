import type { TriggeredActionContractDefinition } from '../types';

export const triggeredActionHangoutsLink: TriggeredActionContractDefinition = {
	slug: 'triggered-action-hangouts-link',
	type: 'triggered-action@1.0.0',
	name: 'Triggered action for creating messages with Hangouts link',
	markers: [],
	data: {
		schedule: 'async',
		filter: {
			type: 'object',
			required: ['type', 'data'],
			properties: {
				type: {
					type: 'string',
					const: 'message@1.0.0',
				},
				data: {
					type: 'object',
					required: ['payload'],
					properties: {
						payload: {
							type: 'object',
							required: ['message'],
							properties: {
								message: {
									type: 'string',
									pattern: "let('?)s hangout",
								},
							},
						},
					},
				},
			},
		},
		action: 'action-create-card@1.0.0',
		target: 'message@1.0.0',
		arguments: {
			reason: null,
			properties: {
				data: {
					timestamp: '{source.data.timestamp}',
					actor: '{source.data.actor}',
					target: '{source.data.target}',
					payload: {
						message:
							'https://hangouts.google.com/hangouts/_/resin.io/jellyfish-{source.id}',
					},
				},
			},
		},
	},
};
