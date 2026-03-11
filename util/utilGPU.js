import { loadText } from './util.js';
export async function initWebGPU() {
    // Get WebGPU context
    if (!navigator.gpu) {
        throw new Error('WebGPU is not supported');
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
    texture;
    view;
    sampler;
    constructor(texture, // To be able to destroy the texture
    view, sampler) {
        this.texture = texture;
        this.view = view;
        this.sampler = sampler;
    }
    static create(device, width, height, format = 'rgba8unorm', usage = GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST) {
        const texture = device.createTexture({
            size: [width, height],
            format,
            usage,
        });
        return new TextureManager(texture, texture.createView(), device.createSampler());
    }
}
export class PipelineBuilder {
    static async createComputePipeline(device, shaderPath, constants, label, entryPoint = 'main') {
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
    static async createRenderPipeline(device, shaderPath, presentationFormat, label) {
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
export function executeComputePass(commandEncoder, pipeline, bindGroup, workgroupCountX, workgroupCountY) {
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
    pass.end();
}
export function createBindGroup(device, pipeline, buffers, label = '', bindGroupIndex = 0) {
    const layout = pipeline.getBindGroupLayout(bindGroupIndex);
    const entries = buffers.map((buffer, index) => ({
        binding: index,
        resource: { buffer: buffer }
    }));
    return device.createBindGroup({ label, layout, entries });
}
