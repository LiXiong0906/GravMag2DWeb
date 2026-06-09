<template>
  <label class="range-field">
    <span class="range-label">
      <span>{{ label }}</span>
      <span>{{ formattedValue }} {{ unit }}</span>
    </span>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="updateValue"
    />
    <input
      class="number-input"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="updateValue"
    />
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    precision?: number;
    modelValue: number;
  }>(),
  {
    precision: 0
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const formattedValue = computed(() => props.modelValue.toFixed(props.precision));

function updateValue(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit('update:modelValue', Number.isFinite(value) ? value : props.modelValue);
}
</script>
