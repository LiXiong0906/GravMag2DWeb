<template>
  <main class="app-shell">
    <header class="top-bar">
      <div>
        <p class="eyebrow">Browser forward modeling</p>
        <h1>重磁勘探 2D 交互建模</h1>
      </div>
      <div class="status-strip">
        <span>{{ visibleBodies.length }} active bodies</span>
        <span>Talwani polygon</span>
        <span>Cloudflare ready</span>
      </div>
    </header>

    <Splitpanes class="workspace workbench-split default-theme" :horizontal="isNarrowViewport">
      <Pane :size="isNarrowViewport ? 68 : 74" :min-size="isNarrowViewport ? 46 : 52">
        <Splitpanes horizontal class="main-stage observation-model-split default-theme">
          <Pane :size="34" :min-size="24">
            <ResponseChart :response="response" @export-csv="exportCsv" />
          </Pane>
          <Pane :size="66" :min-size="38">
            <ModelCanvas
              :bodies="bodies"
              :selected-body-id="selectedBodyId"
              :bounds="modelBounds"
              @update-body="updateBody"
              @select-body="selectBody"
              @reset="resetModel"
            />
          </Pane>
        </Splitpanes>
      </Pane>

      <Pane :size="isNarrowViewport ? 32 : 26" :min-size="isNarrowViewport ? 18 : 20">
        <aside class="control-panel">
        <div class="panel-title">
          <SlidersHorizontal :size="19" />
          <h2>参数</h2>
        </div>

        <fieldset>
          <legend>异常体</legend>
          <div class="tool-row">
            <button class="icon-button" type="button" title="新增异常体" @click="addBody">
              <Plus :size="17" />
            </button>
            <button class="icon-button" type="button" title="复制异常体" @click="duplicateBody">
              <Copy :size="17" />
            </button>
            <button
              class="icon-button"
              type="button"
              title="删除异常体"
              :disabled="bodies.length <= 1"
              @click="deleteBody"
            >
              <Trash2 :size="17" />
            </button>
          </div>

          <div class="body-list">
            <div
              v-for="bodyItem in bodies"
              :key="bodyItem.id"
              class="body-row"
            >
              <button
                class="body-chip"
                :class="{ selected: bodyItem.id === selectedBodyId }"
                type="button"
                @click="selectBody(bodyItem.id)"
              >
                <span class="color-dot" :style="{ background: bodyItem.color }" />
                <span>{{ bodyItem.name }}</span>
              </button>
              <button
                class="mini-icon"
                type="button"
                :title="bodyItem.visible ? '隐藏异常体' : '显示异常体'"
                @click="toggleBodyVisibility(bodyItem.id)"
              >
                <Eye v-if="bodyItem.visible" :size="15" />
                <EyeOff v-else :size="15" />
              </button>
            </div>
          </div>

          <label class="text-field">
            <span>名称</span>
            <input :value="selectedBody.name" @input="renameSelectedBody" />
          </label>
          <label class="color-field">
            <span>颜色</span>
            <input type="color" :value="selectedBody.color" @input="recolorSelectedBody" />
          </label>
          <RangeField
            label="剩余密度 Δρ"
            unit="kg/m³"
            :min="-1200"
            :max="1200"
            :step="10"
            v-model="selectedBody.densityContrastKgM3"
          />
          <RangeField
            label="磁化率 κ"
            unit="SI"
            :min="0"
            :max="0.12"
            :step="0.001"
            :precision="3"
            v-model="selectedBody.susceptibilitySI"
          />
          <p class="microcopy">{{ selectedBody.vertices.length }} vertices</p>
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
          <legend>观测处理</legend>
          <RangeField
            label="采样点数"
            unit="pts"
            :min="81"
            :max="401"
            :step="20"
            v-model="grid.count"
          />
          <RangeField
            label="重力噪声"
            unit="mGal"
            :min="0"
            :max="0.25"
            :step="0.005"
            :precision="3"
            v-model="responseOptions.gravityNoiseMgal"
          />
          <RangeField
            label="磁异常噪声"
            unit="nT"
            :min="0"
            :max="30"
            :step="0.5"
            :precision="1"
            v-model="responseOptions.magneticNoiseNt"
          />
          <RangeField
            label="平滑窗口"
            unit="pts"
            :min="1"
            :max="21"
            :step="2"
            v-model="responseOptions.smoothingWindow"
          />
        </fieldset>

        <fieldset>
          <legend>文件</legend>
          <div class="tool-grid">
            <button class="primary-button" type="button" @click="resetModel">
              <RotateCcw :size="17" />
              重置
            </button>
            <button class="primary-button" type="button" @click="exportModel">
              <FileDown :size="17" />
              模型
            </button>
            <button class="primary-button" type="button" @click="openImportDialog">
              <Upload :size="17" />
              导入
            </button>
            <button class="primary-button" type="button" @click="exportCsv">
              <Table :size="17" />
              CSV
            </button>
          </div>
          <input ref="fileInputRef" class="hidden-input" type="file" accept="application/json" @change="importModel" />
        </fieldset>

        <p class="method-note">
          磁异常采用感应磁化的 2D 剖面近似，默认磁化方向与地磁场一致；首版用于教学建模和形态判断。
        </p>
        </aside>
      </Pane>
    </Splitpanes>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import {
  Copy,
  Eye,
  EyeOff,
  FileDown,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Table,
  Trash2,
  Upload
} from '@lucide/vue';
import ModelCanvas from './components/ModelCanvas.vue';
import ResponseChart from './components/ResponseChart.vue';
import RangeField from './components/RangeField.vue';
import {
  createBodyFromTemplate,
  createDefaultBodies,
  createDefaultField,
  defaultGrid,
  modelBounds
} from './domain/defaultModel';
import { computeModelResponse } from './domain/talwani';
import type { FieldSettings, ObservationGrid, PolygonBody, ResponseOptions } from './domain/types';

const palette = ['#0f766e', '#b42318', '#2563eb', '#b7791f', '#7c3aed'];
let bodyCounter = 3;

const bodies = ref<PolygonBody[]>(createDefaultBodies());
const selectedBodyId = ref(bodies.value[0].id);
const field = reactive<FieldSettings>(createDefaultField());
const grid = reactive<ObservationGrid>({ ...defaultGrid });
const responseOptions = reactive<ResponseOptions>({
  gravityNoiseMgal: 0,
  magneticNoiseNt: 0,
  smoothingWindow: 1,
  noiseSeed: 20260609
});
const fileInputRef = ref<HTMLInputElement | null>(null);
const isNarrowViewport = ref(false);

const selectedBody = computed({
  get() {
    return bodies.value.find((body) => body.id === selectedBodyId.value) ?? bodies.value[0];
  },
  set(nextBody: PolygonBody) {
    updateBody(nextBody);
  }
});
const visibleBodies = computed(() => bodies.value.filter((body) => body.visible));
const response = computed(() => computeModelResponse(grid, bodies.value, field, responseOptions));

function resetModel() {
  bodies.value = createDefaultBodies();
  selectedBodyId.value = bodies.value[0].id;
  bodyCounter = 3;
  Object.assign(field, createDefaultField());
  Object.assign(grid, defaultGrid);
  Object.assign(responseOptions, {
    gravityNoiseMgal: 0,
    magneticNoiseNt: 0,
    smoothingWindow: 1,
    noiseSeed: 20260609
  });
}

function updateBody(nextBody: PolygonBody) {
  bodies.value = bodies.value.map((body) => (body.id === nextBody.id ? nextBody : body));
}

function selectBody(id: string) {
  selectedBodyId.value = id;
}

function addBody() {
  const index = bodies.value.length;
  const nextBody = createBodyFromTemplate(
    createBodyId(),
    `Source ${index + 1}`,
    palette[index % palette.length],
    -520 + index * 260,
    (index % 2) * 90,
    0.48
  );
  bodies.value = [...bodies.value, nextBody];
  selectedBodyId.value = nextBody.id;
}

function duplicateBody() {
  const source = selectedBody.value;
  const nextBody: PolygonBody = {
    ...source,
    id: createBodyId(),
    name: `${source.name} copy`,
    color: palette[bodies.value.length % palette.length],
    visible: true,
    vertices: source.vertices.map((point) => ({
      x: Math.min(modelBounds.maxX, point.x + 120),
      z: Math.min(modelBounds.maxZ, point.z + 80)
    }))
  };
  bodies.value = [...bodies.value, nextBody];
  selectedBodyId.value = nextBody.id;
}

function deleteBody() {
  if (bodies.value.length <= 1) {
    return;
  }

  const nextBodies = bodies.value.filter((body) => body.id !== selectedBodyId.value);
  bodies.value = nextBodies;
  selectedBodyId.value = nextBodies[0].id;
}

function toggleBodyVisibility(id: string) {
  bodies.value = bodies.value.map((body) =>
    body.id === id ? { ...body, visible: !body.visible } : body
  );
}

function renameSelectedBody(event: Event) {
  updateBody({
    ...selectedBody.value,
    name: (event.target as HTMLInputElement).value || selectedBody.value.name
  });
}

function recolorSelectedBody(event: Event) {
  updateBody({
    ...selectedBody.value,
    color: (event.target as HTMLInputElement).value
  });
}

function exportModel() {
  downloadText(
    'talwani-model.json',
    JSON.stringify(
      {
        version: 1,
        bodies: bodies.value,
        field,
        grid,
        responseOptions
      },
      null,
      2
    ),
    'application/json'
  );
}

function openImportDialog() {
  fileInputRef.value?.click();
}

async function importModel(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) {
    return;
  }

  const payload = JSON.parse(await file.text()) as {
    bodies?: PolygonBody[];
    field?: FieldSettings;
    grid?: ObservationGrid;
    responseOptions?: ResponseOptions;
  };
  if (!Array.isArray(payload.bodies) || payload.bodies.length === 0) {
    return;
  }

  bodies.value = payload.bodies.map((body, index) => normalizeImportedBody(body, index));
  selectedBodyId.value = bodies.value[0].id;
  Object.assign(field, payload.field ?? createDefaultField());
  Object.assign(grid, payload.grid ?? defaultGrid);
  Object.assign(responseOptions, payload.responseOptions ?? responseOptions);
}

function exportCsv() {
  const header = 'x_m,gravity_mgal,magnetic_nt,raw_gravity_mgal,raw_magnetic_nt';
  const rows = response.value.map((point) =>
    [
      point.x.toFixed(3),
      point.gravityMgal.toFixed(6),
      point.magneticNt.toFixed(6),
      point.rawGravityMgal.toFixed(6),
      point.rawMagneticNt.toFixed(6)
    ].join(',')
  );
  downloadText('talwani-response.csv', [header, ...rows].join('\n'), 'text/csv');
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeImportedBody(body: PolygonBody, index: number): PolygonBody {
  return {
    id: body.id || createBodyId(),
    name: body.name || `Source ${index + 1}`,
    color: body.color || palette[index % palette.length],
    visible: body.visible !== false,
    densityContrastKgM3: Number(body.densityContrastKgM3) || 0,
    susceptibilitySI: Number(body.susceptibilitySI) || 0,
    vertices: Array.isArray(body.vertices) ? body.vertices : []
  };
}

function createBodyId() {
  const id = `body-${bodyCounter}`;
  bodyCounter += 1;
  return id;
}

function syncViewportMode() {
  isNarrowViewport.value = window.matchMedia('(max-width: 1040px)').matches;
}

onMounted(() => {
  syncViewportMode();
  window.addEventListener('resize', syncViewportMode);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportMode);
});
</script>
