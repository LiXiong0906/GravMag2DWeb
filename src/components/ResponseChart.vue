<template>
  <section class="chart-shell" ref="shellRef">
    <div class="chart-header">
      <div>
        <p class="eyebrow">Observation line</p>
        <h2>Δg / ΔT response</h2>
      </div>
      <div class="chart-actions">
        <button class="icon-button" type="button" title="导出曲线 CSV" @click="$emit('exportCsv')">
          <Table :size="18" />
        </button>
        <button class="icon-button" type="button" title="导出曲线 PNG" @click="exportPng">
          <Download :size="18" />
        </button>
      </div>
    </div>
    <div ref="chartRef" class="chart-canvas" />
  </section>
</template>

<script setup lang="ts">
import { Download, Table } from '@lucide/vue';
import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent, type GridComponentOption } from 'echarts/components';
import { LineChart, type LineSeriesOption } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ModelResponsePoint } from '../domain/types';

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

type EChartsOption = echarts.ComposeOption<GridComponentOption | LineSeriesOption>;

const props = defineProps<{
  response: ModelResponsePoint[];
}>();

defineEmits<{
  exportCsv: [];
}>();

const chartRef = ref<HTMLDivElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const option = computed<EChartsOption>(() => ({
  animation: false,
  color: ['#0f766e', '#b42318'],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value: unknown) => `${Number(value).toFixed(3)}`
  },
  legend: {
    right: 108,
    top: 8,
    itemWidth: 18,
    itemHeight: 10,
    textStyle: {
      color: '#25313c'
    }
  },
  grid: {
    top: 44,
    left: 58,
    right: 58,
    bottom: 40
  },
  xAxis: {
    type: 'value',
    name: 'x (m)',
    nameLocation: 'middle',
    nameGap: 26,
    axisLine: { lineStyle: { color: '#52616f' } },
    axisLabel: { color: '#52616f' },
    splitLine: { lineStyle: { color: '#e5e7eb' } }
  },
  yAxis: [
    {
      type: 'value',
      name: 'Δg (mGal)',
      axisLine: { lineStyle: { color: '#0f766e' } },
      axisLabel: { color: '#0f766e' },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    {
      type: 'value',
      name: 'ΔT (nT)',
      axisLine: { lineStyle: { color: '#b42318' } },
      axisLabel: { color: '#b42318' },
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: 'Δg',
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2.4 },
      data: props.response.map((point) => [point.x, point.gravityMgal])
    },
    {
      name: 'ΔT',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2.2 },
      data: props.response.map((point) => [point.x, point.magneticNt])
    }
  ]
}));

function renderChart() {
  if (!chartRef.value) {
    return;
  }

  if (!chart) {
    chart = echarts.init(chartRef.value, undefined, { renderer: 'canvas' });
  }

  chart.setOption(option.value, true);
}

function exportPng() {
  if (!chart) {
    return;
  }

  const link = document.createElement('a');
  link.download = 'talwani-response.png';
  link.href = chart.getDataURL({
    pixelRatio: 4,
    backgroundColor: '#ffffff'
  });
  link.click();
}

onMounted(async () => {
  await nextTick();
  renderChart();
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartRef.value);
  }
});

watch(option, renderChart, { deep: true });

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>
