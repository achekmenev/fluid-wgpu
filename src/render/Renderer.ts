import { Fluid, SimulationConfig } from '../core/fluid.js';
import { PipelineBuilder, TextureManager } from '../util/utilGPU.js';
import { RendererToTexture, textureToScreen } from './RendererToTexture.js';

function createCanvas(label: string): HTMLCanvasElement {
  // making this
  // <div>
  //   <canvas></canvas>
  //   <div>`label`</div>
  // </div>
  const canvas = document.createElement('canvas');
  canvas.id = label;
  //canvas.width = width;
  //canvas.height = height;

  const container = document.createElement('div');
  container.className = 'canvas-container';

  const description = document.createElement('div');
  description.textContent = label;

  container.appendChild(canvas);
  container.appendChild(description);
  document.body.appendChild(container);

  return canvas;
}

function getWGPUContext(canvas: HTMLCanvasElement): GPUCanvasContext  {
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get webgpu context');
  }

  return context;
}

export class Renderer {
  //rendererToTextore: RendererToTexture;

  private static canvasVel = createCanvas('Abs velocity');
  private static canvasP = createCanvas('Pressure correction');
  private static canvasF = createCanvas('External force');
  private static canvasDust = createCanvas('Dust density');
  private static canvasBorder = createCanvas('Cell types');
  private static canvasSDF = createCanvas('SDF');
  private static canvases = [
    this.canvasVel,
    this.canvasP,
    this.canvasF,
    this.canvasDust,
    this.canvasBorder,
    this.canvasSDF
  ];

  private static contextVel = getWGPUContext(this.canvasVel);
  private static contextP = getWGPUContext(this.canvasP);
  private static contextF = getWGPUContext(this.canvasF);
  private static contextDust = getWGPUContext(this.canvasDust);
  private static contextBorder = getWGPUContext(this.canvasBorder);
  private static contextSDF = getWGPUContext(this.canvasSDF);
  private static contexts = [
    this.contextVel,
    this.contextP,
    this.contextF,
    this.contextDust,
    this.contextSDF,
    this.contextBorder
  ];

  private constructor(
    device: GPUDevice,
    canvasTextureFormat: GPUTextureFormat,
    simCfg: SimulationConfig,
    private textureManager: TextureManager,
    private rendererToTexture: RendererToTexture,
    private renderPipeline: GPURenderPipeline,
    private renderBindGroup: GPUBindGroup
  ) {
    Renderer.canvases.forEach(canvas => {
      canvas.width = simCfg.numX;
      canvas.height = simCfg.numY;
    });

    Renderer.contexts.forEach(context => {
      context.configure({
        device,
        format: canvasTextureFormat,
      });
    });
  }

  static async create(
    device: GPUDevice,
    canvasTextureFormat: GPUTextureFormat,
    fluid: Fluid
  ): Promise<Renderer> {
    const textureManager = TextureManager.create(
      device,
      fluid.simCfg.numX,
      fluid.simCfg.numY
    );

    const rendererToTexture = await RendererToTexture.create(device, textureManager.view, fluid);

    //// Render info
    //
    const renderPipeline = await PipelineBuilder.createRenderPipeline(
      device,
      './render/textureToScreen.wgsl',
      canvasTextureFormat,
      'Textured quad pipeline'
    );

    const renderBindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: textureManager.view },
        { binding: 1, resource: textureManager.sampler },
      ],
    });
    //
    //// Render info

    return new Renderer(
      device,
      canvasTextureFormat,
      fluid.simCfg,
      textureManager,
      rendererToTexture,
      renderPipeline,
      renderBindGroup
    )
  }

  destroy(): void {
    this.textureManager.texture.destroy();

    Renderer.contexts.forEach(context => {
      context.unconfigure();
    });
  }

  renderAll(commandEncoder: GPUCommandEncoder): void {
    this.rendererToTexture.renderVelocity(commandEncoder);
    textureToScreen(Renderer.contextVel, commandEncoder, this.renderPipeline, this.renderBindGroup);

    this.rendererToTexture.renderPressure(commandEncoder);
    textureToScreen(Renderer.contextP, commandEncoder, this.renderPipeline, this.renderBindGroup);

    this.rendererToTexture.renderForce(commandEncoder);
    textureToScreen(Renderer.contextF, commandEncoder, this.renderPipeline, this.renderBindGroup);

    this.rendererToTexture.renderDust(commandEncoder);
    textureToScreen(Renderer.contextDust, commandEncoder, this.renderPipeline, this.renderBindGroup);

    this.rendererToTexture.renderBorder(commandEncoder);
    textureToScreen(Renderer.contextBorder, commandEncoder, this.renderPipeline, this.renderBindGroup);

    this.rendererToTexture.renderSDF(commandEncoder);
    textureToScreen(Renderer.contextSDF, commandEncoder, this.renderPipeline, this.renderBindGroup);
  }
}