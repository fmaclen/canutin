<script
	lang="ts"
	generics="Perspective extends AccountSharesPerspectiveOptions | AssetSharesPerspectiveOptions"
>
	import CheckboxLabel from '$lib/components/checkbox-label.svelte';
	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { m } from '$lib/paraglide/messages';
	import type {
		AccountSharesPerspectiveOptions,
		AssetSharesPerspectiveOptions
	} from '$lib/pocketbase.schema';

	type GrantedShare = {
		id: string;
		includeInNetWorth: boolean;
		perspective: Perspective;
		recipientEmail: string;
	};

	interface Props {
		isLoading: boolean;
		canWrite: boolean;
		recordPerspective: Perspective;
		grantedShares: GrantedShare[];
		normalPerspective: Perspective;
		inversePerspective: Perspective;
		shareRecipientEmail: string;
		sharePerspective: Perspective;
		includeInNetWorth: boolean;
		onCreateShare: () => void | Promise<void>;
		onUpdateRecipientPreference: () => void | Promise<void>;
		onRevokeShare: (shareId: string) => void | Promise<void>;
	}

	let {
		isLoading,
		canWrite,
		recordPerspective,
		grantedShares,
		normalPerspective,
		inversePerspective,
		shareRecipientEmail = $bindable(),
		sharePerspective = $bindable(),
		includeInNetWorth = $bindable(),
		onCreateShare,
		onUpdateRecipientPreference,
		onRevokeShare
	}: Props = $props();

	function perspectiveLabel(perspective: Perspective) {
		return perspective === inversePerspective
			? m.sharing_perspective_inverse()
			: m.sharing_perspective_normal();
	}
</script>

<Section>
	<SectionTitle title={m.sharing_section_title()} />
	{#if isLoading}
		<Skeleton class="h-40" />
	{:else if canWrite}
		<div class="border-border overflow-hidden rounded border">
			<form
				class="space-y-0"
				onsubmit={(event) => {
					event.preventDefault();
					onCreateShare();
				}}
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="share-email" class="justify-start pr-0 md:justify-end">
							{m.sharing_label_email()}
						</Label>
						<Input id="share-email" bind:value={shareRecipientEmail} type="email" required />
					</FormFieldRow>

					<FormFieldRow>
						<Label for="share-perspective" class="justify-start pr-0 md:justify-end">
							{m.sharing_label_perspective()}
						</Label>
						<Select.Root type="single" bind:value={sharePerspective}>
							<Select.Trigger id="share-perspective" class="bg-background w-full">
								{perspectiveLabel(sharePerspective)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={normalPerspective}>
									{m.sharing_perspective_normal()}
								</Select.Item>
								<Select.Item value={inversePerspective}>
									{m.sharing_perspective_inverse()}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</FormFieldRow>
				</Fieldset>

				<Fieldset>
					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5">
							{m.sharing_label_shares()}
						</Label>
						<div class="space-y-2">
							{#if grantedShares.length === 0}
								<Input disabled placeholder={m.sharing_empty()} />
							{:else}
								{#each grantedShares as share (share.id)}
									<div
										class="bg-background border-border flex items-start justify-between gap-3 rounded border px-3 py-2.5"
									>
										<div class="min-w-0 text-sm">
											<p class="truncate">{share.recipientEmail}</p>
											<p class="text-muted-foreground">
												{share.includeInNetWorth
													? m.sharing_share_description_included({
															perspective: perspectiveLabel(share.perspective)
														})
													: m.sharing_share_description_excluded({
															perspective: perspectiveLabel(share.perspective)
														})}
											</p>
										</div>
										<Button type="button" variant="outline" onclick={() => onRevokeShare(share.id)}>
											{m.sharing_button_remove()}
										</Button>
									</div>
								{/each}
							{/if}
						</div>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.sharing_share_button()}</Button>
					</div>
				</footer>
			</form>
		</div>
	{:else}
		<div class="border-border overflow-hidden rounded border">
			<form
				class="space-y-0"
				onsubmit={(event) => {
					event.preventDefault();
					onUpdateRecipientPreference();
				}}
			>
				<Fieldset isFirst={true}>
					<FormFieldRow>
						<Label for="perspective" class="justify-start pr-0 md:justify-end">
							{m.sharing_label_perspective()}
						</Label>
						<Input id="perspective" value={perspectiveLabel(recordPerspective)} disabled />
					</FormFieldRow>

					<FormFieldRow itemsAlignment="items-start">
						<Label class="justify-start pr-0 md:justify-end md:pt-2.5">
							{m.sharing_label_marked_as()}
						</Label>
						<CheckboxLabel
							id="include-in-net-worth"
							bind:checked={includeInNetWorth}
							label={m.sharing_label_include_in_net_worth()}
							class="bg-background"
						/>
					</FormFieldRow>
				</Fieldset>

				<footer class="border-border bg-border border-t p-2">
					<div class="flex justify-end">
						<Button type="submit">{m.sharing_button_save()}</Button>
					</div>
				</footer>
			</form>
		</div>
	{/if}
</Section>
