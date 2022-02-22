import { create } from './create';
import { scheduledAction } from './scheduled-action';
import { triggeredAction } from './triggered-action';
import { update } from './update';
import { viewAllViews } from './view-all-views';
import { viewScheduledActions } from './view-scheduled-actions';

// TS-TODO: Load these contracts from a model repo
export default {
	create,
	'triggered-action': triggeredAction,
	'scheduled-action': scheduledAction,
	update,
	'view-all-views': viewAllViews,
	'view-scheduled-actions': viewScheduledActions,
};
