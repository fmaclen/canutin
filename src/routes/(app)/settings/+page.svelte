<script lang="ts">
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import Fieldset from '$lib/components/fieldset.svelte';
	import FormFieldRow from '$lib/components/form-field-row.svelte';
	import SectionTitle from '$lib/components/section-title.svelte';
	import Section from '$lib/components/section.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { getCurrenciesContext } from '$lib/currencies.svelte';
	import {
		interfacePreferences,
		setDisplayCurrency,
		setInterfaceLocale,
		type InterfaceThemeMode
	} from '$lib/interface-preferences.svelte';
	import { logError } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';

	type GitHubRelease = { tag_name: string; prerelease: boolean };

	// A `-` in the version marks a prerelease build, which tracks the newest release flagged as a
	// prerelease. Stable builds compare against the latest published release.
	const isPrereleaseBuild = __APP_VERSION__.includes('-');
	const releasesEndpoint = isPrereleaseBuild
		? 'https://api.github.com/repos/fmaclen/canutin/releases'
		: 'https://api.github.com/repos/fmaclen/canutin/releases/latest';

	const currenciesContext = getCurrenciesContext();

	let latestRelease = $state<GitHubRelease | null>(null);

	let themeDraft = $state<InterfaceThemeMode>(userPrefersMode.current);
	let localeDraft = $state<'en' | 'es'>(interfacePreferences.locale);
	let currencyDraft = $state(interfacePreferences.preferredDisplayCurrency);

	const currentTheme = $derived(userPrefersMode.current);
	const currentLocale = $derived(interfacePreferences.locale);
	const currentPreferredDisplayCurrency = $derived(interfacePreferences.preferredDisplayCurrency);
	const currencyOptions = $derived(currenciesContext.currencyOptions);
	const selectedCurrency = $derived(currenciesContext.getCurrency(currencyDraft));
	const interfaceIsDirty = $derived(
		themeDraft !== currentTheme ||
			localeDraft !== currentLocale ||
			currencyDraft !== currentPreferredDisplayCurrency
	);

	function handleThemeDraftChange(value: string) {
		if (value !== 'system' && value !== 'light' && value !== 'dark') {
			return;
		}
		themeDraft = value;
	}

	function handleLocaleDraftChange(value: string) {
		if (value !== 'en' && value !== 'es') {
			return;
		}
		localeDraft = value;
	}

	async function handleInterfaceSubmit() {
		if (!interfaceIsDirty) return;
		if (
			currencyDraft !== currentPreferredDisplayCurrency &&
			!currenciesContext.hasCurrency(currencyDraft)
		) {
			toast.error(m.currency_required());
			return;
		}

		try {
			if (themeDraft !== currentTheme) {
				setMode(themeDraft);
			}
			if (localeDraft !== currentLocale) {
				await setInterfaceLocale(localeDraft);
			}
			if (currencyDraft !== currentPreferredDisplayCurrency) {
				setDisplayCurrency(currencyDraft);
			}
			toast.success(m.settings_interface_success());
		} catch (error) {
			logError('settings', 'update_interface_preferences', error);
			toast.error(m.settings_interface_language_failed());
		}
	}

	function isGitHubRelease(value: unknown): value is GitHubRelease {
		return (
			typeof value === 'object' &&
			value !== null &&
			'tag_name' in value &&
			typeof value.tag_name === 'string' &&
			'prerelease' in value &&
			typeof value.prerelease === 'boolean'
		);
	}

	// Unauthenticated GitHub requests are capped at 60/hour per IP, so a rejected or malformed
	// response is expected often enough that the About section simply stays quiet about updates.
	async function fetchLatestRelease() {
		try {
			const response = await fetch(releasesEndpoint);
			if (!response.ok) return;

			const payload: unknown = await response.json();
			const release =
				isPrereleaseBuild && Array.isArray(payload)
					? payload.find((entry) => isGitHubRelease(entry) && entry.prerelease)
					: payload;
			if (isGitHubRelease(release)) latestRelease = release;
		} catch (error) {
			logError('settings', 'check_for_update', error);
		}
	}

	// Runs once on mount: effects are client-only, which keeps the request out of SSR.
	$effect(() => {
		fetchLatestRelease();
	});
</script>

<Section>
	<SectionTitle title={m.settings_interface_section_title()} />
	<div class="border-border overflow-hidden rounded border">
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleInterfaceSubmit();
			}}
			class="space-y-0"
		>
			<Fieldset isFirst={true}>
				<FormFieldRow>
					<Label id="theme-label" for="theme" class="justify-start pr-0 md:justify-end"
						>{m.settings_interface_theme_label()}</Label
					>
					<Select.Root type="single" value={themeDraft} onValueChange={handleThemeDraftChange}>
						<Select.Trigger id="theme" aria-labelledby="theme-label" class="bg-background w-full">
							{#if themeDraft === 'light'}
								{m.settings_interface_theme_light_option()}
							{:else if themeDraft === 'dark'}
								{m.settings_interface_theme_dark_option()}
							{:else}
								{m.settings_interface_theme_system_option()}
							{/if}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="system">
								{m.settings_interface_theme_system_option()}
							</Select.Item>
							<Select.Item value="light">
								{m.settings_interface_theme_light_option()}
							</Select.Item>
							<Select.Item value="dark">
								{m.settings_interface_theme_dark_option()}
							</Select.Item>
						</Select.Content>
					</Select.Root>
				</FormFieldRow>

				<FormFieldRow>
					<Label id="language-label" for="language" class="justify-start pr-0 md:justify-end"
						>{m.settings_interface_language_label()}</Label
					>
					<Select.Root type="single" value={localeDraft} onValueChange={handleLocaleDraftChange}>
						<Select.Trigger
							id="language"
							aria-labelledby="language-label"
							class="bg-background w-full"
						>
							{localeDraft === 'es' ? 'Español' : 'English'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="en">English</Select.Item>
							<Select.Item value="es">Español</Select.Item>
						</Select.Content>
					</Select.Root>
				</FormFieldRow>

				<FormFieldRow>
					<Label id="currency-label" for="currency" class="justify-start pr-0 md:justify-end"
						>{m.settings_interface_currency_label()}</Label
					>
					<Select.Root
						type="single"
						value={currencyDraft}
						onValueChange={(value) => (currencyDraft = value)}
					>
						<Select.Trigger
							id="currency"
							aria-labelledby="currency-label"
							class="bg-background w-full"
						>
							{#if selectedCurrency}
								<div class="flex min-w-0 items-center gap-2">
									<span>{selectedCurrency.code}</span>
									{#if selectedCurrency.name}
										<span class="text-muted-foreground truncate">{selectedCurrency.name}</span>
									{/if}
								</div>
							{:else if currencyDraft}
								{currencyDraft}
							{:else}
								<span class="text-muted-foreground">{m.currencies_select_placeholder()}</span>
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#if currencyOptions.length === 0}
								<Select.Item value="__no-currencies" disabled>
									{m.currencies_select_empty()}
								</Select.Item>
							{:else}
								{#each currencyOptions as option (option.value)}
									<Select.Item value={option.value}>
										<div class="flex min-w-0 items-center gap-2">
											<span>{option.code}</span>
											{#if option.name}
												<span class="text-muted-foreground truncate">{option.name}</span>
											{/if}
										</div>
									</Select.Item>
								{/each}
							{/if}
						</Select.Content>
					</Select.Root>
				</FormFieldRow>
			</Fieldset>

			<footer class="border-border bg-border border-t p-2">
				<div class="flex justify-end">
					<Button type="submit" disabled={!interfaceIsDirty}
						>{m.settings_interface_button_save()}</Button
					>
				</div>
			</footer>
		</form>
	</div>
</Section>

<Section>
	<SectionTitle title={m.settings_about_section_title()} />
	<div class="border-border overflow-hidden rounded border">
		<Fieldset isFirst={true}>
			<FormFieldRow>
				<Label for="app-version" class="justify-start pr-0 md:justify-end"
					>{m.settings_about_version_label()}</Label
				>
				<Input id="app-version" readonly value={`v${__APP_VERSION__}`} />
			</FormFieldRow>

			{#if latestRelease}
				<FormFieldRow>
					<Label for="latest-version" class="justify-start pr-0 md:justify-end"
						>{m.settings_about_latest_version_label()}</Label
					>
					<Input
						id="latest-version"
						readonly
						value={latestRelease.tag_name === `v${__APP_VERSION__}`
							? m.settings_about_update_latest()
							: latestRelease.tag_name}
					/>
				</FormFieldRow>
			{/if}
		</Fieldset>
	</div>
</Section>
