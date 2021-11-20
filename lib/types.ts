import { Action } from '@balena/jellyfish-types/build/worker';

// tslint:disable: jsdoc-format
export interface EnqueueOptions {
	context?: LogContext;
	/** slug or id of input contract **/
	card: string;
	/** type of input contract **/
	type?: string;
	/** slug of action contract to run **/
	action: string;
	/** id of actor that the action should be run on behalf of **/
	actor: string;
	/** arguments to be passed to the action **/
	arguments: {
		[k: string]: unknown;
	};
}

export interface LogContext {
	id: string;
	api?: string;
}

export interface ActionLibrary {
	[key: string]: Action;
}
