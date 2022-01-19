import { testUtils as coreTestUtils } from '@balena/jellyfish-core';
import { testUtils } from '../../lib';
import * as utils from '../../lib/utils';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
});

afterAll(() => {
	return testUtils.destroyContext(ctx);
});

describe('.hasCard()', () => {
	test('id = yes (exists), slug = yes (exists)', async () => {
		const card = await ctx.kernel.insertContract(ctx.logContext, ctx.session, {
			slug: coreTestUtils.generateRandomSlug(),
			type: 'card@1.0.0',
			version: '1.0.0',
		});

		expect(
			await utils.hasCard(ctx.logContext, ctx.kernel, ctx.session, {
				id: card.id,
				version: '1.0.0',
				slug: card.slug,
			}),
		).toBe(true);
	});

	test('id = yes (exists), slug = yes (not exist)', async () => {
		const card = await ctx.kernel.insertContract(ctx.logContext, ctx.session, {
			slug: coreTestUtils.generateRandomSlug(),
			type: 'card@1.0.0',
			version: '1.0.0',
		});

		expect(
			await utils.hasCard(ctx.logContext, ctx.kernel, ctx.session, {
				id: card.id,
				version: '1.0.0',
				slug: coreTestUtils.generateRandomSlug(),
			}),
		).toBe(true);
	});

	test('id = yes (not exist), slug = yes (exists)', async () => {
		const card = await ctx.kernel.insertContract(ctx.logContext, ctx.session, {
			slug: coreTestUtils.generateRandomSlug(),
			type: 'card@1.0.0',
			version: '1.0.0',
		});

		expect(
			await utils.hasCard(ctx.logContext, ctx.kernel, ctx.session, {
				id: coreTestUtils.generateRandomId(),
				version: '1.0.0',
				slug: card.slug,
			}),
		).toBe(true);
	});

	test('id = yes (not exist), slug = yes (not exist)', async () => {
		expect(
			await utils.hasCard(ctx.logContext, ctx.kernel, ctx.session, {
				id: coreTestUtils.generateRandomId(),
				version: '1.0.0',
				slug: coreTestUtils.generateRandomSlug(),
			}),
		).toBe(false);
	});

	test('id = no, slug = yes (exists)', async () => {
		const card = await ctx.kernel.insertContract(ctx.logContext, ctx.session, {
			slug: coreTestUtils.generateRandomSlug(),
			type: 'card@1.0.0',
			version: '1.0.0',
		});

		expect(
			await utils.hasCard(ctx.logContext, ctx.kernel, ctx.session, {
				version: '1.0.0',
				slug: card.slug,
			} as any),
		).toBe(true);
	});

	test('id = no, slug = yes (not exist)', async () => {
		expect(
			await utils.hasCard(ctx.logContext, ctx.kernel, ctx.session, {
				version: '1.0.0',
				slug: coreTestUtils.generateRandomSlug(),
			} as any),
		).toBe(false);
	});
});
