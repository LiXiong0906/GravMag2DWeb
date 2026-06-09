<template>
  <section class="model-shell">
    <div class="model-header">
      <div>
        <p class="eyebrow">Subsurface editor</p>
        <h2>Talwani polygons</h2>
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
  bodies: PolygonBody[];
  selectedBodyId: string;
  bounds: ModelBounds;
}>();

const emit = defineEmits<{
  updateBody: [body: PolygonBody];
  selectBody: [id: string];
  reset: [];
}>();

type DragMode = 'vertex' | 'body' | null;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedVertex = ref(0);
const hoveredVertex = ref<{ bodyId: string; vertexIndex: number } | null>(null);
const drag = ref<{
  mode: DragMode;
  bodyId: string;
  startWorld: Point2D;
  startVertices: Point2D[];
} | null>(null);

let resizeObserver: ResizeObserver | null = null;

const activeBody = computed(
  () => props.bodies.find((body) => body.id === props.selectedBodyId) ?? props.bodies[0]
);
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

function findVertexAt(canvasPoint: Point2D) {
  const radius = 12 * window.devicePixelRatio;
  for (const body of [...props.bodies].reverse()) {
    if (!body.visible) {
      continue;
    }
    for (let i = 0; i < body.vertices.length; i += 1) {
      const vertexCanvas = worldToCanvas(body.vertices[i]);
      if (Math.hypot(vertexCanvas.x - canvasPoint.x, vertexCanvas.z - canvasPoint.z) <= radius) {
        return { bodyId: body.id, vertexIndex: i };
      }
    }
  }
  return null;
}

function findBodyAt(worldPoint: Point2D) {
  return [...props.bodies]
    .reverse()
    .find((body) => body.visible && pointInPolygon(worldPoint, body.vertices));
}

function onPointerDown(event: PointerEvent) {
  canvasRef.value?.focus();
  const canvasPoint = eventToCanvasPoint(event);
  const worldPoint = canvasToWorld(canvasPoint);
  const vertexHit = findVertexAt(canvasPoint);

  if (vertexHit) {
    const body = props.bodies.find((candidate) => candidate.id === vertexHit.bodyId);
    if (!body) {
      return;
    }
    selectedVertex.value = vertexHit.vertexIndex;
    emit('selectBody', body.id);
    drag.value = {
      mode: 'vertex',
      bodyId: body.id,
      startWorld: worldPoint,
      startVertices: body.vertices.map((point) => ({ ...point }))
    };
  } else {
    const body = findBodyAt(worldPoint);
    if (body) {
      emit('selectBody', body.id);
      drag.value = {
        mode: 'body',
        bodyId: body.id,
        startWorld: worldPoint,
        startVertices: body.vertices.map((point) => ({ ...point }))
      };
    }
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

  const body = props.bodies.find((candidate) => candidate.id === drag.value?.bodyId);
  if (!body) {
    drag.value = null;
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
    emitBody(body, nextVertices);
  }

  if (drag.value.mode === 'body') {
    const translated = drag.value.startVertices.map((vertex) => ({
      x: vertex.x + dx,
      z: vertex.z + dz
    }));
    emitBody(body, clampTranslatedPolygon(translated));
  }

  render();
}

function onPointerUp() {
  drag.value = null;
}

function onDoubleClick(event: MouseEvent) {
  const worldPoint = clampPointToBounds(canvasToWorld(eventToCanvasPoint(event)), props.bounds);
  const body = findBodyAt(worldPoint) ?? activeBody.value;
  if (!body) {
    return;
  }
  emit('selectBody', body.id);
  const nextVertices = insertPointOnNearestEdge(body.vertices, worldPoint);
  selectedVertex.value = nextVertices.findIndex(
    (point) => point.x === worldPoint.x && point.z === worldPoint.z
  );
  emitBody(body, nextVertices);
}

function onKeyDown(event: KeyboardEvent) {
  const body = activeBody.value;
  if (
    body &&
    (event.key === 'Delete' || event.key === 'Backspace') &&
    body.vertices.length > 3
  ) {
    const nextVertices = body.vertices.filter((_, index) => index !== selectedVertex.value);
    selectedVertex.value = Math.max(0, Math.min(selectedVertex.value, nextVertices.length - 1));
    emitBody(body, nextVertices);
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

function emitBody(body: PolygonBody, vertices: Point2D[]) {
  emit('updateBody', {
    ...body,
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
  props.bodies.forEach((body) => drawPolygon(context, body));
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

function drawPolygon(context: CanvasRenderingContext2D, body: PolygonBody) {
  const points = body.vertices.map(worldToCanvas);
  if (points.length < 3 || !body.visible) {
    return;
  }

  const selected = body.id === props.selectedBodyId;
  context.beginPath();
  context.moveTo(points[0].x, points[0].z);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.z));
  context.closePath();

  context.fillStyle = hexToRgba(body.color, selected ? 0.84 : 0.52);
  context.fill();
  context.strokeStyle = selected ? '#111827' : hexToRgba(body.color, 0.95);
  context.lineWidth = (selected ? 3 : 1.8) * window.devicePixelRatio;
  context.stroke();

  const centroid = worldToCanvas(polygonCentroid(body.vertices));
  context.fillStyle = selected ? '#ffffff' : '#111827';
  context.font = `${12 * window.devicePixelRatio}px Inter, sans-serif`;
  context.textAlign = 'center';
  context.fillText(body.name, centroid.x, centroid.z);
  context.textAlign = 'start';
}

function drawHandles(context: CanvasRenderingContext2D) {
  const body = activeBody.value;
  if (!body || !body.visible) {
    return;
  }

  body.vertices.forEach((vertex, index) => {
    const point = worldToCanvas(vertex);
    const isSelected = selectedVertex.value === index;
    const isHovered =
      hoveredVertex.value?.bodyId === body.id && hoveredVertex.value.vertexIndex === index;
    context.beginPath();
    context.arc(
      point.x,
      point.z,
      (isSelected || isHovered ? 7 : 5) * window.devicePixelRatio,
      0,
      Math.PI * 2
    );
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
  context.fillText('z down', canvas.width - 72 * window.devicePixelRatio, 24 * window.devicePixelRatio);
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

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
  () => [props.bodies, props.selectedBodyId],
  () => render(),
  { deep: true }
);

watch(
  () => props.selectedBodyId,
  () => {
    selectedVertex.value = 0;
  }
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>
