import { Popover as PopoverPrimitive } from 'bits-ui';

import Content from './popover-content.svelte';
import SelectTrigger from './popover-select-trigger.svelte';

const Root = PopoverPrimitive.Root;
const Trigger = PopoverPrimitive.Trigger;
const Close = PopoverPrimitive.Close;

export {
	Root,
	Trigger,
	Content,
	SelectTrigger,
	Close,
	//
	Root as Popover,
	Trigger as PopoverTrigger,
	Content as PopoverContent,
	SelectTrigger as PopoverSelectTrigger,
	Close as PopoverClose
};
