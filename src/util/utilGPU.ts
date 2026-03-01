import { loadText } from './util.js';

export async function initWebGPU(): Promise<[GPUDevice, GPUTextureFormat]> {
  // Get WebGPU context
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No GPU adapter found');
  }

  const device = await adapter.requestDevice();

  const canvasTextureFormat = navigator.gpu.getPreferredCanvasFormat();

  /*const contexts = canvases.map(canvas => {
    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to get webgpu context');
    }

    context.configure({
      device,
      format: canvasTextureFormat,
    });

    return context;
  });

  return { device, contexts, canvasTextureFormat };*/

  return [device, canvasTextureFormat];
}

/*export function getCanvasContexts(device: GPUDevice, canvasTextureFormat: GPUTextureFormat, canvases: HTMLCanvasElement[]) {
  const contexts = canvases.map(canvas => {
    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to get webgpu context');
    }

    context.configure({
      device,
      format: canvasTextureFormat,
    });

    return context;
  });

  return contexts;
}*/

export class TextureManager {
  constructor(
    public texture: GPUTexture, // To be able to destroy the texture
    public view: GPUTextureView,
    public sampler: GPUSampler,
  ) { }

  static create(
    device: GPUDevice,
    width: number,
    height: number,
    format: GPUTextureFormat = 'rgba8unorm',
    usage: GPUTextureUsageFlags =
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST
  ) {
    const texture = device.createTexture({
      size: [width, height],
      format,
      usage,
    });

    return new TextureManager(
      texture,
      texture.createView(),
      device.createSampler(),
    );
  }
}

export class PipelineBuilder {
  static async createComputePipeline(
    device: GPUDevice,
    shaderPath: string,
    constants: Record<string, number>,
    label: string,
    entryPoint: string = 'main'
  ) {
    const shaderCode = await loadText(shaderPath);
    const shaderModule = device.createShaderModule({
      label: shaderPath,
      code: shaderCode
    });

    return device.createComputePipeline({
      label,
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint,
        constants,
      },
    });
  }

  static async createRenderPipeline(
    device: GPUDevice,
    shaderPath: string,
    presentationFormat: GPUTextureFormat,
    label: string
  ) {
    const shaderCode = await loadText(shaderPath);
    const shaderModule = device.createShaderModule({
      label,
      code: shaderCode,
    });

    return device.createRenderPipeline({
      label,
      layout: 'auto',
      vertex: { module: shaderModule },
      fragment: {
        module: shaderModule,
        targets: [{ format: presentationFormat }],
      },
    });
  }
}

export function executeComputePass(
  commandEncoder: GPUCommandEncoder,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  workgroupCountX: number,
  workgroupCountY?: number | undefined,
) {
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
  pass.end();
}

export function createBindGroup(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  buffers: GPUBuffer[],
  label: string = '',
  bindGroupIndex: number = 0
) {
  const layout = pipeline.getBindGroupLayout(bindGroupIndex);
  const entries = buffers.map((buffer, index) => ({
    binding: index,
    resource: { buffer: buffer }
  }));

  return device.createBindGroup({ label, layout, entries });
}