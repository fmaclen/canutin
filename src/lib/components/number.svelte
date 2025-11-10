<script lang="ts">
	type Sentiment = 'positive' | 'negative' | 'neutral' | 'undefined';

	interface Props {
		value: string | number;
		sentiment?: Sentiment;
	}

	let { value, sentiment = 'undefined' }: Props = $props();

	const sentimentClass = {
		positive: 'text-cash',
		negative: 'text-debt',
		neutral: 'text-muted-foreground',
		undefined: ''
	};
</script>

<span class={`font-jetbrains-mono uppercase ${sentimentClass[sentiment]}`}>{value}</span>
