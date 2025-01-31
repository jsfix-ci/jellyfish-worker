import type { ContractDefinition } from 'autumndb';

export const roleTransformerWorker: ContractDefinition = {
	slug: 'role-transformer-worker',
	version: '1.0.0',
	name: 'Transformer worker permissions',
	type: 'role@1.0.0',
	markers: [],
	data: {
		read: {
			anyOf: [
				{
					type: 'object',
					additionalProperties: true,
					required: ['slug', 'type'],
					properties: {
						slug: {
							type: 'string',
							not: {
								enum: ['action-create-user'],
							},
						},
						type: {
							type: 'string',
							not: {
								enum: [
									'action-request@1.0.0',
									'create@1.0.0',
									'event@1.0.0',
									'external-event@1.0.0',
									'role@1.0.0',
									'type@1.0.0',
									'user@1.0.0',
									'view@1.0.0',
									'password-reset@1.0.0',
									'first-time-login@1.0.0',
								],
							},
						},
					},
				},
				{
					type: 'object',
					required: ['slug', 'type'],
					additionalProperties: true,
					properties: {
						slug: {
							not: {
								enum: [
									'action',
									'event',
									'external-event',
									'role',
									'first-time-login',
									'triggered-action',
								],
							},
						},
						type: {
							type: 'string',
							const: 'type@1.0.0',
						},
					},
				},
				{
					type: 'object',
					description:
						'User can view their own execute, session, web-push-subscription and view cards',
					additionalProperties: true,
					required: ['data', 'type'],
					properties: {
						type: {
							type: 'string',
							enum: [
								'view@1.0.0',
								'session@1.0.0',
								'web-push-subscription@1.0.0',
								'execute@1.0.0',
							],
						},
						data: {
							type: 'object',
							required: ['actor'],
							additionalProperties: true,
							properties: {
								actor: {
									type: 'string',
									const: {
										$eval: 'user.id',
									},
								},
							},
						},
					},
				},
				{
					type: 'object',
					additionalProperties: true,
					required: ['slug', 'type', 'data'],
					properties: {
						slug: {
							type: 'string',
							const: {
								$eval: 'user.slug',
							},
						},
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
						data: {
							type: 'object',
							additionalProperties: false,
							properties: {
								status: {
									type: 'object',
									additionalProperties: true,
								},
								email: {
									type: ['string', 'array'],
								},
								hash: {
									type: 'string',
								},
								avatar: {
									type: ['string', 'null'],
								},
								oauth: {
									type: 'object',
									additionalProperties: true,
								},
								profile: {
									type: 'object',
									additionalProperties: true,
								},
							},
						},
					},
				},
				{
					type: 'object',
					description: "User can view create cards that don't create users",
					additionalProperties: true,
					required: ['data', 'type'],
					properties: {
						type: {
							type: 'string',
							const: 'create@1.0.0',
						},
						data: {
							type: 'object',
							additionalProperties: true,
							properties: {
								payload: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											not: {
												enum: ['user@1.0.0', 'user'],
											},
										},
									},
								},
							},
						},
					},
				},
				{
					type: 'object',
					additionalProperties: true,
					required: ['slug', 'type', 'data'],
					properties: {
						type: {
							type: 'string',
							not: {
								const: 'view@1.0.0',
							},
						},
						data: {
							type: 'object',
							additionalProperties: true,
						},
					},
				},
				{
					type: 'object',
					additionalProperties: true,
					required: ['id', 'type', 'data', 'slug'],
					properties: {
						id: {
							type: 'string',
						},
						slug: {
							type: 'string',
							not: {
								enum: ['user-admin', 'user-guest'],
							},
						},
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
						data: {
							type: 'object',
							additionalProperties: false,
							properties: {
								status: {
									type: 'object',
									additionalProperties: true,
								},
								email: {
									type: ['string', 'array'],
								},
								profile: {
									type: 'object',
									additionalProperties: false,
									properties: {
										name: {
											type: 'object',
										},
										about: {
											type: 'object',
										},
										birthday: {
											type: 'string',
										},
										startDate: {
											type: 'string',
										},
										country: {
											type: 'string',
										},
										city: {
											type: 'string',
										},
										timezone: {
											type: 'string',
										},
									},
								},
								avatar: {
									type: ['string', 'null'],
								},
							},
						},
					},
				},
			],
		},
	},
};
