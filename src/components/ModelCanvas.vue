<template>
  <section class="model-shell">
    <div class="model-header">
      <div>
        <p class="eyebrow">Subsurface editor</p>
        <h2>Talwani polygon</h2>
      </div>
      <div class="model-tools">
        <button class="icon-button" type="button" title="重置模型" @click="$emit('reset')">
          <RotateCcw :size="18" />
        </button>
        <button class="icon-button" type="button" title="导出剖面 PNG" @click="exportPng">
          <Download :size="18" />
        </button>
      </div>
    </div>
    <canvas
      ref="canvasRef"
      class="model-canvas"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @dblclick="onDoubleClick"
      @keydown="onKeyDown"
    />
  </section>
</template>

<script setup lang="ts">
import { Download, RotateCcw } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  clampPointToBounds,
  insertPointOnNearestEdge,
  pointInPolygon,
  polygonCentroid
} from '../domain/geometry';
import type { ModelBounds, Point2D, PolygonBody } from '../domain/types';

const props = defineProps<{
  body: PolygonBody;
  bounds: ModelBounds;
}>();

const emit = defineEmits<{
  update: [body: PolygonBody];
  reset: [];
}>();

type DragMode = 'vertex' | 'body' | null;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedVertex = ref(0);
const hoveredVertex = ref<number | null>(null);
const drag = ref<{
  mode: DragMode;
  startWorld: Point2D;
  startVertices: Point2D[];
} | null>(null);

let resizeObserver: ResizeObserver | null = null;

const worldWidth = computed(() => props.bounds.maxX - props.bounds.minX);
const worldHeight = computed(() => props.bounds.maxZ - props.bounds.minZ);

function worldToCanvas(point: Point2D): Point2D {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, z: 0 };
  }

  return {
    x: ((point.x - props.bounds.minX) / worldWidth.value) * canvas.width,
    z: ((point.z - props.bounds.minZ) / worldHeight.value) * canvas.height
  };
}

function canvasToWorld(point: Point2D): Point2D {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, z: 0 };
  }

  return {
    x: props.bounds.minX + (point.x / canvas.width) * worldWidth.value,
    z: props.bounds.minZ + (point.z / canvas.height) * worldHeight.value
  };
}

function eventToCanvasPoint(event: PointerEvent | MouseEvent): Point2D {
  const canvas = canvasRef.value;
  const rect = canvas?.getBoundingClientRect();
  if (!canvas || !rect) {
    return { x: 0, z: 0 };
  }

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    z: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function findVertexAt(canvasPoint: Point2D): number | null {
  const radius = 12 * window.devicePixelRatio;
  for (let i = 0; i < props.body.vertices.length; i += 1) {
    const vertexCanvas = worldToCanvas(props.body.vertices[i]);
    if (Math.hypot(vertexCanvas.x - canvasPoint.x, vertexCanvas.z - canvasPoint.z) <= radius) {
      return i;
    }
  }
  return null;
}

function onPointerDown(event: PointerEvent) {
  canvasRef.value?.focus();
  const canvasPoint = eventToCanvasPoint(event);
  const worldPoint = canvasToWorld(canvasPoint);
  const vertexIndex = findVertexAt(canvasPoint);

  if (vertexIndex !== null) {
    selectedVertex.value = vertexIndex;
    drag.value = {
      mode: 'vertex',
      startWorld: worldPoint,
      startVertices: props.body.vertices.map((point) => ({ ...point }))
    };
  } else if (pointInPolygon(worldPoint, props.body.vertices)) {
    drag.value = {
      mode: 'body',
      startWorld: worldPoint,
      startVertices: props.body.vertices.map((point) => ({ ...point }))
    };
  }

  render();
}

function onPointerMove(event: PointerEvent) {
  const canvasPoint = eventToCanvasPoint(event);
  hoveredVertex.value = findVertexAt(canvasPoint);

  if (!drag.value) {
    render();
    return;
  }

  const worldPoint = canvasToWorld(canvasPoint);
  const dx = worldPoint.x - drag.value.startWorld.x;
  const dz = worldPoint.z - drag.value.startWorld.z;

  if (drag.value.mode === 'vertex') {
    const nextVertices = drag.value.startVertices.map((vertex, index) =>
      index === selectedVertex.value
        ? clampPointToBounds({ x: vertex.x + dx, z: vertex.z + dz }, props.bounds)
        : { ...vertex }
    );
    emitBody(nextVertices);
  }

  if (drag.value.mode === 'body') {
    const translated = drag.value.startVertices.map((vertex) => ({
      x: vertex.x + dx,
      z: vertex.z + dz
    }));
    const clamped = clampTranslatedPolygon(translated);
    emitBody(clamped);
  }

  render();
}

function onPointerUp() {
  drag.value = null;
}

function onDoubleClick(event: MouseEvent) {
  const worldPoint = clampPointToBounds(canvasToWorld(eventToCanvasPoint(event)), props.bounds);
  const nextVertices = insertPointOnNearestEdge(props.body.vertices, worldPoint);
  selectedVertex.value = nextVertices.findIndex(
    (point) => point.x === worldPoint.x && point.z === worldPoint.z
  );
  emitBody(nextVertices);
}

function onKeyDown(event: KeyboardEvent) {
  if ((event.key === 'Delete' || event.key === 'Backspace') && props.body.vertices.length > 3) {
    const nextVertices = props.body.vertices.filter((_, index) => index !== selectedVertex.value);
    selectedVertex.value = Math.max(0, Math.min(selectedVertex.value, nextVertices.length - 1));
    emitBody(nextVertices);
  }
}

function clampTranslatedPolygon(vertices: Point2D[]): Point2D[] {
  const minX = Math.min(...vertices.map((point) => point.x));
  const maxX = Math.max(...vertices.map((point) => point.x));
  const minZ = Math.min(...vertices.map((point) => point.z));
  const maxZ = Math.max(...vertices.map((point) => point.z));
  const dx =
    minX < props.bounds.minX
      ? props.bounds.minX - minX
      : maxX > props.bounds.maxX
        ? props.bounds.maxX - maxX
        : 0;
  const dz =
    minZ < props.bounds.minZ
      ? props.bounds.minZ - minZ
      : maxZ > props.bounds.maxZ
        ? props.bounds.maxZ - maxZ
        : 0;

  return vertices.map((point) => ({
    x: point.x + dx,
    z: point.z + dz
  }));
}

function emitBody(vertices: Point2D[]) {
  emit('update', {
    ...props.body,
    vertices
  });
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  render();
}

function render() {
  const canvas = canvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(context, canvas);
  drawPolygon(context);
  drawHandles(context);
  drawScale(context, canvas);
}

function drawBackground(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = '#d8dee7';
  context.lineWidth = 1;
  context.font = `${12 * window.devicePixelRatio}px Inter, sans-serif`;
  context.fillStyle = '#607080';

  for (let x = -1000; x <= 1000; x += 400) {
    const point = worldToCanvas({ x, z: props.bounds.minZ });
    context.beginPath();
    context.moveTo(point.x, 0);
    context.lineTo(point.x, canvas.height);
    context.stroke();
    context.fillText(`${x} m`, point.x + 4, 18 * window.devicePixelRatio);
  }

  for (let z = 100; z <= 900; z += 200) {
    const point = worldToCanvas({ x: props.bounds.minX, z });
    context.beginPath();
    context.moveTo(0, point.z);
    context.lineTo(canvas.width, point.z);
    context.stroke();
    context.fillText(`${z} m`, 8 * window.devicePixelRatio, point.z - 6);
  }

  const surface = worldToCanvas({ x: props.bounds.minX, z: props.bounds.minZ });
  context.strokeStyle = '#111827';
  context.lineWidth = 2 * window.devicePixelRatio;
  context.beginPath();
  context.moveTo(0, surface.z + 1);
  context.lineTo(canvas.width, surface.z + 1);
  context.stroke();
}

function drawPolygon(context: CanvasRenderingContext2D) {
  const points = props.body.vertices.map(worldToCanvas);
  if (points.length < 3) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].z);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.z));
  context.closePath();

  const gradient = context.createLinearGradient(0, 0, 0, canvasRef.value?.height ?? 1);
  gradient.addColorStop(0, 'rgba(15, 118, 110, 0.90)');
  gradient.addColorStop(1, 'rgba(180, 35, 24, 0.82)');
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#111827';
  context.lineWidth = 2.5 * window.devicePixelRatio;
  context.stroke();

  const centroid = worldToCanvas(polygonCentroid(props.body.vertices));
  context.fillStyle = '#ffffff';
  context.font = `${13 * window.devicePixelRatio}px Inter, sans-serif`;
  context.textAlign = 'center';
  context.fillText(
    `Δρ ${props.body.densityContrastKgM3.toFixed(0)} kg/m³ | κ ${props.body.susceptibilitySI.toFixed(3)}`,
    centroid.x,
    centroid.z
  );
  context.textAlign = 'start';
}

function drawHandles(context: CanvasRenderingContext2D) {
  props.body.vertices.forEach((vertex, index) => {
    const point = worldToCanvas(vertex);
    const isSelected = selectedVertex.value === index;
    const isHovered = hoveredVertex.value === index;
    context.beginPath();
    context.arc(point.x, point.z, (isSelected || isHovered ? 7 : 5) * window.devicePixelRatio, 0, Math.PI * 2);
    context.fillStyle = isSelected ? '#fef3c7' : '#ffffff';
    context.fill();
    context.strokeStyle = isSelected || isHovered ? '#111827' : '#475569';
    context.lineWidth = 2 * window.devicePixelRatio;
    context.stroke();
  });
}

function drawScale(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const start = worldToCanvas({ x: props.bounds.maxX - 500, z: props.bounds.maxZ - 54 });
  const end = worldToCanvas({ x: props.bounds.maxX - 100, z: props.bounds.maxZ - 54 });
  context.strokeStyle = '#111827';
  context.lineWidth = 2 * window.devicePixelRatio;
  context.beginPath();
  context.moveTo(start.x, start.z);
  context.lineTo(end.x, end.z);
  context.stroke();
  context.fillStyle = '#111827';
  context.font = `${12 * window.devicePixelRatio}px Inter, sans-serif`;
  context.fillText('400 m', (start.x + end.x) / 2 - 18 * window.devicePixelRatio, start.z - 8);
  context.fillText('z downward', canvas.width - 96 * window.devicePixelRatio, 24 * window.devicePixelRatio);
}

function exportPng() {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const link = document.createElement('a');
  link.download = 'talwani-section.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

onMounted(async () => {
  await nextTick();
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasRef.value);
    resizeCanvas();
  }
});

watch(
  () => props.body,
  () => render(),
  { deep: true }
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>
