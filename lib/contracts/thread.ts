import type { ContractDefinition } from 'autumndb';
import * as contractMixins from './mixins';

const slug = 'thread';
const type = 'type@1.0.0';

export const thread: ContractDefinition = contractMixins.mixin(
	contractMixins.withEvents(slug, type),
)({
	slug,
	type,
	name: 'Chat thread',
	data: {
		schema: {
			type: 'object',
			properties: {
				data: {
					type: 'object',
					properties: {
						description: {
							type: 'string',
							fullTextSearch: true,
						},
						dms: {
							description:
								'If true, indicates that this thread is used for direct messaging between users',
							type: 'boolean',
						},
						actors: {
							description:
								'If this is a direct message thread, this field should contrain an array of slugs, for each of the participating users',
							type: 'array',
							items: {
								type: 'string',
							},
						},
					},
				},
			},
		},
	},
});
