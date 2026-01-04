import { Popover as PopoverPrimitive } from 'bits-ui';

import Content from './popover-content.svelte';
import SelectTrigger from './popover-select-trigger.svelte';
import Trigger from './popover-trigger.svelte';

const Root = PopoverPrimitive.Root;
const Close = PopoverPrimitive.Close;

export {
	Root,
	Content,
	Trigger,
	SelectTrigger,
	Close,
	//
	Root as Popover,
	Content as PopoverContent,
	Trigger as PopoverTrigger,
	SelectTrigger as PopoverSelectTrigger,
	Close as PopoverClose
};
