import type { TriggeredActionContractDefinition } from '../types';

export const triggeredActionSetUserAvatar: TriggeredActionContractDefinition = {
	slug: 'triggered-action-set-user-avatar',
	type: 'triggered-action@1.0.0',
	name: 'Triggered action for user avatars',
	markers: [],
	data: {
		schedule: 'sync',
		filter: {
			type: 'object',
			required: ['type'],
			properties: {
				type: {
					type: 'string',
					const: 'user@1.0.0',
				},
			},
		},
		action: 'action-set-user-avatar@1.0.0',
		target: {
			$eval: 'source.id',
		},
		arguments: {},
	},
};
