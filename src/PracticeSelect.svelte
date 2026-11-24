<script lang="ts">
  import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@ui-sdk/svelte/select'

  let { label, items, value, change }: {
    label: string
    items: { label: string; value: string }[]
    value: string
    change: (value: string) => void
  } = $props()
</script>

<div class="field">
  <Select {items} {value} onValueChange={(next) => { if (typeof next === 'string') change(next) }}>
    <SelectLabel>{label}</SelectLabel>
    <SelectTrigger class="practice-select">
      <SelectValue />
    </SelectTrigger>
    <SelectContent class="practice-select-options">
      {#each items as item (item.value)}
        <SelectItem value={item.value}>{item.label}</SelectItem>
      {/each}
    </SelectContent>
  </Select>
</div>
