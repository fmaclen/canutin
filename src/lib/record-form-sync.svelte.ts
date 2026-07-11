import { toast } from 'svelte-sonner';

type Options<RecordData, FormData extends Record<string, unknown>> = {
	getRecord: () => RecordData | null | undefined;
	getVersion: (record: RecordData) => string;
	getFormData: (record: RecordData) => Promise<FormData>;
	setFormData: (formData: FormData) => void;
	isDirty: (lastSyncedData: FormData) => boolean;
	dataStaleMessage: () => string;
	refreshLabel: () => string;
	refreshedMessage: () => string;
};

export function createRecordFormSync<RecordData, FormData extends Record<string, unknown>>(
	options: Options<RecordData, FormData>
) {
	let lastSyncedData = $state<FormData | null>(null);
	let remoteVersion = $state<string | null>(null);
	let justSaved = $state(false);
	let initialized = $state(false);

	async function synchronize(record: RecordData) {
		const formData = await options.getFormData(record);
		options.setFormData(formData);
		lastSyncedData = { ...formData };
		remoteVersion = options.getVersion(record);
		initialized = true;
	}

	$effect(() => {
		const record = options.getRecord();
		if (!record) return;

		const currentVersion = options.getVersion(record);

		if (!initialized) {
			synchronize(record);
			return;
		}

		if (remoteVersion === currentVersion) return;

		if (justSaved) {
			remoteVersion = currentVersion;
			justSaved = false;
			return;
		}

		if (lastSyncedData && options.isDirty(lastSyncedData)) {
			toast.warning(options.dataStaleMessage(), {
				action: {
					label: options.refreshLabel(),
					onClick: () => {
						synchronize(record);
						toast.success(options.refreshedMessage());
					}
				}
			});
			remoteVersion = currentVersion;
		} else {
			synchronize(record);
		}
	});

	return {
		markSaving() {
			justSaved = true;
		},
		markSaved(formData: FormData) {
			lastSyncedData = { ...formData };
		},
		markSaveFailed() {
			justSaved = false;
		}
	};
}
