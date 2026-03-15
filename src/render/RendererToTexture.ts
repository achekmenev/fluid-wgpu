import { Fluid } from '../core/fluid.js';
import { executeComputePass, PipelineBuilder } from '../util/utilGPU.js';
import { MinMaxReducer } from './minMaxReducer.js'
import { RenderConfig } from './Renderer.js';

export class RendererToTexture {
  private uniformValues = new Float32Array(2);

  constructor(
    private device: GPUDevice,
    private fluid: Fluid,
    private renderConfig: RenderConfig,
    //private uniformBuffer: GPUBuffer,
    private vectorStaggeredToTexturePipeline: GPUComputePipeline,
    private scalarToTexturePipeline: GPUComputePipeline,
    private borderToTexturePipeline: GPUComputePipeline,
    private velocityMinMaxBuffer: GPUBuffer,
    private velocityToTextureBindGroups: GPUBindGroup[],
    //private pressureMinMaxReducer: MinMaxReducer,
    private pressureMinMaxBuffer: GPUBuffer,
    private pressureToTextureBindGroup: GPUBindGroup,
    // Ping-pong reducers and bind groups
    //private dustMinMaxReducers: MinMaxReducer[],
    private dustMinMaxBuffer: GPUBuffer,
    private dustToTextureBindGroups: GPUBindGroup[],
    private borderToTextureBindGroup: GPUBindGroup,
    //private sdfMinMaxReducer: MinMaxReducer,
    private sdfMinMaxBuffer: GPUBuffer,
    private sdfToTextureBindGroup: GPUBindGroup,
    private forceMinMaxBuffer: GPUBuffer,
    private forceToTextureBindGroup: GPUBindGroup
  ) { }

  static async create(
    device: GPUDevice,
    textureView: GPUTextureView,
    fluid: Fluid,
    renderConfig: RenderConfig
  ) {
    const simSfg = fluid.simCfg;
    const constants: Record<string, number> = {
      workgroupSizeX: simSfg.workgroupSizeX,
      workgroupSizeY: simSfg.workgroupSizeY,
      numX: simSfg.numX,
      numY: simSfg.numY,
    };

    const vectorStaggeredToTexturePipeline = await PipelineBuilder.createComputePipeline(
      device,
      './render/vectorStaggeredToTexture.wgsl',
      constants,
      'Vector staggered to texture'
    );

    const scalarToTexturePipeline = await PipelineBuilder.createComputePipeline(
      device,
      './render/scalarToTexture.wgsl',
      constants,
      'Scalar to texture'
    );

    const borderToTexturePipeline = await PipelineBuilder.createComputePipeline(
      device,
      './render/borderToTexture.wgsl',
      constants,
      'Border to texture'
    );

    const velocityMinMaxBuffer = device.createBuffer({
      label: 'Uniforms min and max',
      size: 2 * 4, // 2 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const velocityToTextureBindGroups = [0, 1].map(i =>
      device.createBindGroup({
        label: `Compute to texture renderer ${i}`,
        layout: vectorStaggeredToTexturePipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: fluid.u[i] }
        }, {
          binding: 1,
          resource: { buffer: fluid.v[i] }
        }, {
          binding: 2,
          resource: textureView
        }, {
          binding: 3,
          resource: { buffer: velocityMinMaxBuffer }
        }]
      }));

    const numCells = fluid.simCfg.numX * fluid.simCfg.numY;
    const pressureMinMaxReducer = new MinMaxReducer(device, fluid.p, numCells);

    /*//// Bind group for uniforms
    //
    // Create a buffer for the uniform values
    const uniformBufferSize = 2 * 4; // 2 floats
    const uniformBuffer = device.createBuffer({
      label: 'Uniforms min and max',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Create a typed array to hold the values for the uniforms in JavaScript
    const uniformValues = new Float32Array(uniformBufferSize / 4);
    //
    //// Bind group for uniforms
    */

    const pressureMinMaxBuffer = device.createBuffer({
      label: 'Uniforms min and max',
      size: 2 * 4, // 2 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const pressureToTextureBindGroup = device.createBindGroup({
      label: 'Compute to Texture renderer ',
      layout: scalarToTexturePipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.p }
      }, {
        binding: 1,
        resource: textureView
      }, {
        binding: 2,
        resource: { buffer: pressureMinMaxBuffer }
      }/*, {
        binding: 2,
        resource: { buffer: pressureMinMaxReducer.intermediateBuffers[pressureMinMaxReducer.intermediateBuffers.length - 1] }
      }*/]
    });


    //const dustMinMaxReducers = [0, 1].map(i =>
    //  new MinMaxReducer(device, fluid.m[i], numCells)
    //);
    const dustMinMaxBuffer = device.createBuffer({
      label: 'Uniforms min and max',
      size: 2 * 4, // 2 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const dustToTextureBindGroups = [0, 1].map(i =>
      device.createBindGroup({
        label: 'Compute to Texture renderer ',
        layout: scalarToTexturePipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: fluid.m[i] }
        }, {
          binding: 1,
          resource: textureView
        }, {
          binding: 2,
          resource: { buffer: dustMinMaxBuffer }
        }/*, {
          binding: 2,
          resource: { buffer: dustMinMaxReducers[i].intermediateBuffers[dustMinMaxReducers[i].intermediateBuffers.length - 1] }
        }*/]
      }));

    const borderToTextureBindGroup = device.createBindGroup({
      label: 'Compute to Texture renderer ',
      layout: borderToTexturePipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.b }
      }, {
        binding: 1,
        resource: textureView
      }]
    });

    //const sdfMinMaxReducer = new MinMaxReducer(device, fluid.d, numCells);
    const sdfMinMaxBuffer = device.createBuffer({
      label: 'Uniforms min and max',
      size: 2 * 4, // 2 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sdfToTextureBindGroup = device.createBindGroup({
      label: 'Compute to Texture renderer ',
      layout: scalarToTexturePipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.d }
      }, {
        binding: 1,
        resource: textureView
      }, {
        binding: 2,
        resource: { buffer: sdfMinMaxBuffer }
      }/*, {
        binding: 2,
        resource: { buffer: sdfMinMaxReducer.intermediateBuffers[sdfMinMaxReducer.intermediateBuffers.length - 1] }
      }*/]
    });

    const forceMinMaxBuffer = device.createBuffer({
      label: 'Uniforms min and max',
      size: 2 * 4, // 2 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const forceToTextureBindGroup = device.createBindGroup({
      label: `Compute to texture renderer`,
      layout: vectorStaggeredToTexturePipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.fu }
      }, {
        binding: 1,
        resource: { buffer: fluid.fv }
      }, {
        binding: 2,
        resource: textureView
      }, {
        binding: 3,
        resource: { buffer: forceMinMaxBuffer }
      }]
    });

    return new RendererToTexture(
      device,
      fluid,
      renderConfig,
      vectorStaggeredToTexturePipeline,
      scalarToTexturePipeline,
      borderToTexturePipeline,
      velocityMinMaxBuffer,
      velocityToTextureBindGroups,
      //pressureMinMaxReducer,
      pressureMinMaxBuffer,
      pressureToTextureBindGroup,
      //dustMinMaxReducers,
      dustMinMaxBuffer,
      dustToTextureBindGroups,
      borderToTextureBindGroup,
      //sdfMinMaxReducer,
      sdfMinMaxBuffer,
      sdfToTextureBindGroup,
      forceMinMaxBuffer,
      forceToTextureBindGroup
    );
  }

  setMinMaxScalar(buffer: GPUBuffer, min: number, max: number) {
    this.uniformValues[0] = min;
    this.uniformValues[1] = max;
    this.device.queue.writeBuffer(buffer, 0, this.uniformValues);
  }

  renderVelocity(commandEncoder: GPUCommandEncoder): void {
    this.setMinMaxScalar(this.velocityMinMaxBuffer, this.renderConfig.velocityMin, this.renderConfig.velocityMax);
    executeComputePass(
      commandEncoder,
      this.vectorStaggeredToTexturePipeline,
      this.velocityToTextureBindGroups[this.fluid.pingPongIndexVel],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderPressure(commandEncoder: GPUCommandEncoder): void {
    //this.pressureMinMaxReducer.computeMinMax(commandEncoder);
    //this.setMinMaxScalar(-0.1, 0.1);
    //this.uniformValues[0] = -0.1;
    //this.uniformValues[1] = 0.1;
    //this.device.queue.writeBuffer(this.pressureMinMaxBuffer, 0, this.uniformValues);
    this.setMinMaxScalar(this.pressureMinMaxBuffer, this.renderConfig.pressureMin, this.renderConfig.pressureMax);

    executeComputePass(
      commandEncoder,
      this.scalarToTexturePipeline,
      this.pressureToTextureBindGroup,
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderDust(commandEncoder: GPUCommandEncoder): void {
    //this.setMinMaxScalar(0.0, 1.0);
    //this.uniformValues[0] = 0.0;
    //this.uniformValues[1] = 1.0;
    //this.device.queue.writeBuffer(this.dustMinMaxBuffer, 0, this.uniformValues);
    this.setMinMaxScalar(this.dustMinMaxBuffer, this.renderConfig.dustMin, this.renderConfig.dustMax);

    executeComputePass(
      commandEncoder,
      this.scalarToTexturePipeline,
      this.dustToTextureBindGroups[this.fluid.pingPongIndexM],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderBorder(commandEncoder: GPUCommandEncoder): void {
    executeComputePass(
      commandEncoder,
      this.borderToTexturePipeline,
      this.borderToTextureBindGroup,
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderSDF(commandEncoder: GPUCommandEncoder): void {
    //this.sdfMinMaxReducer.computeMinMax(commandEncoder);
    //this.setMinMaxScalar(-10.0, 10.0);
    //this.uniformValues[0] = -10.0;
    //this.uniformValues[1] = 10.0;
    //this.device.queue.writeBuffer(this.sdfMinMaxBuffer, 0, this.uniformValues);
    const simCfg = this.fluid.simCfg;
    const minDist = Math.min(simCfg.numX, simCfg.numY);
    this.setMinMaxScalar(this.sdfMinMaxBuffer, -0.5 * minDist, 0.5 * minDist);

    executeComputePass(
      commandEncoder,
      this.scalarToTexturePipeline,
      this.sdfToTextureBindGroup,
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderForce(commandEncoder: GPUCommandEncoder): void {
    this.setMinMaxScalar(this.forceMinMaxBuffer, this.renderConfig.forceMin, this.renderConfig.forceMax);
    executeComputePass(
      commandEncoder,
      this.vectorStaggeredToTexturePipeline,
      this.forceToTextureBindGroup,
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }
}


export function textureToScreen(
  context: GPUCanvasContext,
  commandEncoder: GPUCommandEncoder,
  renderPipeline: GPURenderPipeline,
  renderBindGroup: GPUBindGroup
): void {
  // Get the current texture from the canvas context and
  // set it as the texture to render to.
  const renderPassDescriptor: GPURenderPassDescriptor = {
    label: 'Texture to Screen',
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0.3, 0.3, 0.3, 0], // Clear to transparent
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  // Execute render pass
  const pass = commandEncoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, renderBindGroup);
  pass.draw(6);  // call the vertex shader 6 times
  pass.end();
}