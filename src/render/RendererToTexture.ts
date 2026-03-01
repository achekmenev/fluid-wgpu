import { Fluid } from '../core/fluid.js';
import { executeComputePass, PipelineBuilder } from '../util/utilGPU.js';

export class RendererToTexture {
  constructor(
    private fluid: Fluid,
    private vectorStaggeredToTexturePipeline: GPUComputePipeline,
    private scalarToTexturePipeline: GPUComputePipeline,
    private borderToTexturePipeline: GPUComputePipeline,
    private velocityToTextureBindGroups: GPUBindGroup[],
    private pressureToTextureBindGroup: GPUBindGroup,
    private dustToTextureBindGroups: GPUBindGroup[],
    private borderToTextureBindGroup: GPUBindGroup,
    private sdfToTextureBindGroup: GPUBindGroup,
    private forceToTextureBindGroup: GPUBindGroup
  ) { }

  static async create(device: GPUDevice, textureView: GPUTextureView, fluid: Fluid,
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
        }]
      }));

    const pressureToTextureBindGroup = device.createBindGroup({
      label: 'Compute to Texture renderer ',
      layout: scalarToTexturePipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.p }
      }, {
        binding: 1,
        resource: textureView
      }]
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
        }]
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

    const sdfToTextureBindGroup = device.createBindGroup({
      label: 'Compute to Texture renderer ',
      layout: scalarToTexturePipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.d }
      }, {
        binding: 1,
        resource: textureView
      }]
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
      }]
    });

    return new RendererToTexture(
      fluid,
      vectorStaggeredToTexturePipeline,
      scalarToTexturePipeline,
      borderToTexturePipeline,
      velocityToTextureBindGroups,
      pressureToTextureBindGroup,
      dustToTextureBindGroups,
      borderToTextureBindGroup,
      sdfToTextureBindGroup,
      forceToTextureBindGroup
    );
  }

  renderVelocity(commandEncoder: GPUCommandEncoder): void {
    executeComputePass(
      commandEncoder,
      this.vectorStaggeredToTexturePipeline,
      this.velocityToTextureBindGroups[this.fluid.pingPongIndexVel],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderPressure(commandEncoder: GPUCommandEncoder): void {
    executeComputePass(
      commandEncoder,
      this.scalarToTexturePipeline,
      this.pressureToTextureBindGroup,
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderDust(commandEncoder: GPUCommandEncoder): void {
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
    executeComputePass(
      commandEncoder,
      this.scalarToTexturePipeline,
      this.sdfToTextureBindGroup,
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  renderForce(commandEncoder: GPUCommandEncoder): void {
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