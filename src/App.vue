<template>
  <main class="app-shell">
    <header class="top-bar">
      <div>
        <p class="eyebrow">Browser forward modeling</p>
        <h1>重磁勘探 2D 交互建模</h1>
      </div>
      <div class="status-strip">
        <span>Talwani polygon</span>
        <span>Pure frontend</span>
        <span>Cloudflare ready</span>
      </div>
    </header>

    <section class="workspace">
      <div class="main-stage">
        <ResponseChart :response="response" />
        <ModelCanvas :body="body" :bounds="modelBounds" @update="updateBody" @reset="resetModel" />
      </div>

      <aside class="control-panel">
        <div class="panel-title">
          <SlidersHorizontal :size="19" />
          <h2>参数</h2>
        </div>

        <fieldset>
          <legend>异常体</legend>
          <RangeField
            label="剩余密度 Δρ"
            unit="kg/m³"
            :min="-1200"
            :max="1200"
            :step="10"
            v-model="body.densityContrastKgM3"
          />
          <RangeField
            label="磁化率 κ"
            unit="SI"
            :min="0"
            :max="0.12"
            :step="0.001"
            :precision="3"
            v-model="body.susceptibilitySI"
          />
          <p class="microcopy">{{ body.vertices.length }} vertices</p>
        </fieldset>

        <fieldset>
          <legend>地磁场</legend>
          <RangeField
            label="总场强度 F"
            unit="nT"
            :min="25000"
            :max="65000"
            :step="500"
            v-model="field.fieldIntensityNt"
          />
          <RangeField
            label="倾角 I"
            unit="°"
            :min="-80"
            :max="80"
            :step="1"
            v-model="field.inclinationDeg"
          />
          <RangeField
            label="偏角 D"
            unit="°"
            :min="-30"
            :max="30"
            :step="1"
            v-model="field.declinationDeg"
          />
          <RangeField
            label="剖面方位"
            unit="°"
            :min="0"
            :max="180"
            :step="5"
            v-model="field.profileAzimuthDeg"
          />
        </fieldset>

        <fieldset>
          <legend>观测线</legend>
          <RangeField
            label="采样点数"
            unit="pts"
            :min="81"
            :max="401"
            :step="20"
            v-model="grid.count"
          />
          <button class="primary-button" type="button" @click="resetModel">
            <RotateCcw :size="17" />
            重置示例模型
          </button>
        </fieldset>

        <p class="method-note">
          磁异常采用感应磁化的 2D 剖面近似，默认磁化方向与地磁场一致；首版用于教学建模和形态判断。
        </p>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RotateCcw, SlidersHorizontal } from '@lucide/vue';
import ModelCanvas from './components/ModelCanvas.vue';
import ResponseChart from './components/ResponseChart.vue';
import RangeField from './components/RangeField.vue';
import { createDefaultBody, createDefaultField, defaultGrid, modelBounds } from './domain/defaultModel';
import { computeModelResponse } from './domain/talwani';
import type { FieldSettings, ObservationGrid, PolygonBody } from './domain/types';

const body = ref<PolygonBody>(createDefaultBody());
const field = reactive<FieldSettings>(createDefaultField());
const grid = reactive<ObservationGrid>({ ...defaultGrid });

const response = computed(() => computeModelResponse(grid, body.value, field));

function resetModel() {
  body.value = createDefaultBody();
  Object.assign(field, createDefaultField());
  Object.assign(grid, defaultGrid);
}

function updateBody(nextBody: PolygonBody) {
  body.value = nextBody;
}
</script>
