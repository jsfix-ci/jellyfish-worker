import type { TriggeredActionContractDefinition } from '../types';

export const triggeredActionIncrementTag: TriggeredActionContractDefinition = {
	slug: 'triggered-action-increment-tag',
	type: 'triggered-action@1.0.0',
	name: 'Triggered action for incrementing count value of a tag',
	markers: [],
	data: {
		schedule: 'async',
		filter: {
			type: 'object',
			required: ['type', 'data'],
			properties: {
				type: {
					type: 'string',
					enum: ['message@1.0.0', 'whisper@1.0.0'],
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
									pattern: '(\\s|^)(#[a-zA-Z\\d-_\\/]+)',
								},
							},
						},
					},
				},
			},
		},
		action: 'action-increment-tag@1.0.0',
		target: 'tag@1.0.0',
		arguments: {
			reason: null,
			name: {
				$eval:
					"matchRE('(\\s|^)(#[a-zA-Z\\d-_\\/]+)', 'gm', source.data.payload.message)",
			},
		},
	},
};
