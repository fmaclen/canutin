import { Command as CommandPrimitive } from 'bits-ui';

import Empty from './command-empty.svelte';
import Group from './command-group.svelte';
import Input from './command-input.svelte';
import Item from './command-item.svelte';
import List from './command-list.svelte';
import Separator from './command-separator.svelte';
import Root from './command.svelte';

const Loading = CommandPrimitive.Loading;

export {
	Root,
	Empty,
	Group,
	Item,
	Input,
	List,
	Separator,
	Loading,
	//
	Root as Command,
	Empty as CommandEmpty,
	Group as CommandGroup,
	Item as CommandItem,
	Input as CommandInput,
	List as CommandList,
	Separator as CommandSeparator,
	Loading as CommandLoading
};
