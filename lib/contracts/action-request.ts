export const actionRequest = {
	slug: 'action-request',
	type: 'type@1.0.0',
	name: 'Jellyfish Action Request',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^action-request-[a-z0-9-]+$',
				},
				type: {
					type: 'string',
					enum: ['action-request', 'action-request@1.0.0'],
				},
				data: {
					type: 'object',
					properties: {
						epoch: {
							type: 'number',
						},
						timestamp: {
							type: 'string',
							format: 'date-time',
						},
						context: {
							type: 'object',
							properties: {
								id: {
									type: 'string',
								},
							},
							required: ['id'],
						},
						originator: {
							type: 'string',
							format: 'uuid',
						},
						actor: {
							type: 'string',
							format: 'uuid',
						},
						action: {
							type: 'string',
						},
						input: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									type: 'string',
									format: 'uuid',
								},
							},
						},
						arguments: {
							type: 'object',
						},
						schedule: {
							type: 'string',
						},
					},
					required: [
						'epoch',
						'timestamp',
						'context',
						'actor',
						'action',
						'input',
						'arguments',
					],
				},
			},
			required: ['slug', 'type', 'data'],
		},
	},
};
