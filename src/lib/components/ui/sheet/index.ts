import { Dialog as SheetPrimitive } from 'bits-ui';

import Content from './sheet-content.svelte';
import Description from './sheet-description.svelte';
import Header from './sheet-header.svelte';
import Overlay from './sheet-overlay.svelte';
import Title from './sheet-title.svelte';

const Root = SheetPrimitive.Root;
const Portal = SheetPrimitive.Portal;

export {
	Root,
	Portal,
	Overlay,
	Content,
	Header,
	Title,
	Description,
	//
	Root as Sheet,
	Portal as SheetPortal,
	Overlay as SheetOverlay,
	Content as SheetContent,
	Header as SheetHeader,
	Title as SheetTitle,
	Description as SheetDescription
};
