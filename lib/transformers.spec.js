/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const ava = require('ava')
const sinon = require('sinon')
const _ = require('lodash')
const {
	v4: uuid
} = require('uuid')
const transformers = require('./transformers')

const getEvaluateParamsStub = (transformerCards, oldCard, newCard, returnActor = true) => {
	const executeSpy = sinon.spy((actionRequest) => {
		// This stub assumes that action requests only ever create a card
		return {
			error: false,
			data: {
				id: uuid(),
				slug: `${actionRequest.card.split('@')[0]}-${uuid()}`
			}
		}
	})

	// Return the spy and stub as a tuple
	return [
		executeSpy,
		{
			transformers: _.castArray(transformerCards),
			oldCard,
			newCard,
			context: {
				id: 'foobar'
			},

			// Query is only used to receive and actorId, so just stub the response here
			query: _.constant(returnActor ? [
				{
					type: 'user',
					id: uuid(),
					data: {}
				}
			] : []
			),
			executeAndAwaitAction: executeSpy
		}
	]
}

ava('evaluate() should create a task if a transformer matches a card that has been set to artefactReady:true', async (test) => {
	const transformer = {
		id: uuid(),
		slug: 'test-transformer',
		type: 'transformer@@1.0.0',
		data: {
			inputFilter: {
				type: 'object'
			}
		}
	}

	const oldCard = {
		type: 'card@1.0.0',
		data: {
			artefactReady: false
		}
	}
	const newCard = {
		type: 'card@1.0.0',
		data: {
			artefactReady: true
		}
	}

	const [ executeSpy, params ] = getEvaluateParamsStub(transformer, oldCard, newCard)

	await transformers.evaluate(params)

	test.true(executeSpy.calledTwice, 'Two actions were executed')
	test.is(executeSpy.firstCall.firstArg.card, 'task@1.0.0', 'The first call was for a task')
	test.is(executeSpy.firstCall.firstArg.action, 'action-create-card@1.0.0', 'The first call was to create a card')

	test.is(executeSpy.secondCall.firstArg.card, 'link@1.0.0', 'The second call was for a link')
	test.is(executeSpy.secondCall.firstArg.action, 'action-create-card@1.0.0', 'The second call was to create a card')
})

ava('evaluate() should only create a task when a transformer matches the input for an updated card', async (test) => {
	const transformer = {
		id: uuid(),
		slug: 'test-transformer',
		type: 'transformer@@1.0.0',
		data: {
			inputFilter: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						const: 'baz'
					}
				}
			}
		}
	}
	const oldCard = {
		type: 'card@1.0.0',
		name: 'foo',
		data: {
			artefactReady: false
		}
	}
	const newCard = {
		type: 'card@1.0.0',
		name: 'foo',
		data: {
			artefactReady: true
		}
	}

	const [ executeSpy, params ] = getEvaluateParamsStub(transformer, oldCard, newCard)

	await transformers.evaluate(params)

	test.true(executeSpy.notCalled, 'No actions were executed')
})

ava('evaluate() should not create a task when a there is no previous card', async (test) => {
	const transformer = {
		id: uuid(),
		slug: 'test-transformer',
		type: 'transformer@@1.0.0',
		data: {
			inputFilter: {
				type: 'object'
			}
		}
	}

	const newCard = {
		type: 'card@1.0.0',
		data: {
			artefactReady: true
		}
	}

	const [ executeSpy, params ] = getEvaluateParamsStub(transformer, null, newCard)

	await transformers.evaluate(params)

	test.true(executeSpy.notCalled, 'No actions were executed')
})

ava('evaluate() should not create a task if a transformer doesn\'t have an owner', async (test) => {
	const transformer = {
		id: uuid(),
		slug: 'test-transformer',
		type: 'transformer@@1.0.0',
		data: {
			inputFilter: {
				type: 'object'
			}
		}
	}

	const oldCard = {
		type: 'card@1.0.0',
		data: {
			artefactReady: false
		}
	}
	const newCard = {
		type: 'card@1.0.0',
		data: {
			artefactReady: true
		}
	}

	const [ executeSpy, params ] = getEvaluateParamsStub(transformer, oldCard, newCard, false)

	await transformers.evaluate(params)

	test.true(executeSpy.notCalled, 'No actions were executed')
})
