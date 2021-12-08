import * as _ from 'lodash';
import * as skhema from 'skhema';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '@balena/jellyfish-logger';
import { JSONSchema, core } from '@balena/jellyfish-types';
import { LogContext, EnqueueOptions } from './types';
import { ProducerResults } from '@balena/jellyfish-types/build/queue';

const logger = getLogger('worker');

export interface EvaluateOptions {
	transformers: Transformer[];
	oldCard: core.Contract<any> | null;
	newCard: core.Contract<any>;
	context: LogContext;
	query: (
		schema: JSONSchema,
		opts: { sortBy?: string; sortDir?: 'asc' | 'desc'; limit?: number },
	) => Promise<core.Contract[]>;
	// TS-TODO: Make slug optional in core model
	executeAndAwaitAction: (
		actionRequest: EnqueueOptions,
	) => Promise<ProducerResults>;
}

export interface TransformerData {
	inputFilter: any;
	workerFilter: any;
	[key: string]: unknown;
}
export type Transformer = core.Contract<TransformerData>;

// TS-TODO: Transformers should be a default model and included in this module
export const evaluate = async ({
	transformers,
	oldCard,
	newCard,
	context,
	query,
	executeAndAwaitAction,
}: EvaluateOptions): Promise<null> => {
	if (!transformers || !Array.isArray(transformers)) {
		return null;
	}

	// Only run transformers with cards with a valid artifact or which do not have artifacts at all
	// and their input filter matches now, but didn't match before (or artifact wasn't ready)
	const readyNow = newCard.data?.$transformer?.artifactReady;
	if (readyNow === false) {
		return null;
	}
	const artifactReadyChanged =
		oldCard?.data?.$transformer?.artifactReady !== readyNow;

	await Promise.all(
		transformers.map(async (transformer: Transformer) => {
			if (!transformer.data.inputFilter) {
				return;
			}
			// TODO: Allow transformer input filter to match $$links, by re-using the trigger filter
			const matchesNow = skhema.isValid(transformer.data.inputFilter, newCard);
			const matchedPreviously = skhema.isValid(
				transformer.data.inputFilter,
				oldCard || {},
			);

			const shouldRun =
				matchesNow && (!matchedPreviously || artifactReadyChanged);

			if (!shouldRun) {
				return;
			}

			const transformerActor = await getTransformerActor(query, transformer);
			if (!transformerActor) {
				logger.warn(
					context,
					'Cannot run transformer that does not have an owner',
					{
						transformerId: transformer.id,
						transformerSlug: transformer.slug,
					},
				);
				return;
			}

			// Re enqueue an action request to call the matchmaking function
			// TODO: link task to origin transformer
			const result: any = await executeAndAwaitAction({
				card: 'task@1.0.0',
				type: 'type',
				action: 'action-create-card@1.0.0',
				actor: transformerActor.id,
				arguments: {
					reason: null,
					properties: {
						name: `Transform ${newCard.name} using transformer ${transformer.name}`,
						data: {
							status: 'pending',
							input: newCard,
							transformer,
							actor: transformerActor.id,
							workerFilter: {
								schema: transformer.data.workerFilter,
							},
						},
					},
				},
			});

			// TODO: Improve core API for linking cards
			await executeAndAwaitAction({
				card: 'link@1.0.0',
				type: 'type',
				action: 'action-create-card@1.0.0',
				actor: transformerActor.id,
				arguments: {
					reason: null,
					properties: {
						slug: `link-${transformer.id}-generated-${
							result.data.id
						}-${uuidv4()}`,
						name: 'generated',
						data: {
							inverseName: 'was generated by',
							from: {
								id: transformer.id,
								type: transformer.type,
							},
							to: {
								id: result.data.id,
								type: result.data.type,
							},
						},
					},
				},
			});
		}),
	);
	return null;
};

async function getTransformerActor(
	query: (
		schema: any,
		opts: {
			sortBy?: string;
			sortDir?: 'asc' | 'desc';
			limit?: number;
		},
	) => Promise<core.Contract[]>,
	transformer: Transformer,
) {
	// The transformer should be run on behalf of the actor that owns the
	// transformer
	const [transformerOwner] = await query(
		{
			type: 'object',
			properties: {
				active: {
					const: true,
				},
			},
			$$links: {
				owns: {
					type: 'object',
					properties: {
						id: {
							const: transformer.id,
						},
					},
				},
			},
		},
		{
			limit: 1,
		},
	);

	if (transformerOwner) {
		return transformerOwner;
	}

	// Or by the actor that owns its contract-repository
	const [repoOwner] = await query(
		{
			type: 'object',
			properties: {
				active: {
					const: true,
				},
			},
			$$links: {
				owns: {
					type: 'object',
					required: ['type', 'data'],
					properties: {
						type: {
							const: 'contract-repository@1.0.0',
						},
						active: {
							const: true,
						},
						data: {
							type: 'object',
							required: ['base_slug'],
							properties: {
								base_slug: {
									const: transformer.slug,
								},
							},
						},
					},
				},
			},
		},
		{
			limit: 1,
		},
	);
	return repoOwner;
}
