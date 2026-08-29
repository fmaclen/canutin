import { Popover as PopoverPrimitive } from 'bits-ui';

import Content from './popover-content.svelte';
import SelectTrigger from './popover-select-trigger.svelte';

const Root = PopoverPrimitive.Root;
const Close = PopoverPrimitive.Close;

export {
	Root,
	Content,
	SelectTrigger,
	Close,
	//
	Root as Popover,
	Content as PopoverContent,
	SelectTrigger as PopoverSelectTrigger,
	Close as PopoverClose
};
