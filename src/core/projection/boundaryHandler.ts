import { Fluid } from '../fluid.js';
import { PipelineBuilder, createBindGroup, executeComputePass } from '../../util/utilGPU.js'

// Make solver interface?

export class BoundaryHandler {
  private constructor(
    private fluid: Fluid,
    private setBoundaryNormalVelocityAndPressurePipeline: GPUComputePipeline,
    private setBoundaryNormalVelocityAndPressureBindGroups: [GPUBindGroup, GPUBindGroup],
    private setBoundaryTangentVelocityPipeline: GPUComputePipeline,
    private setBoundaryTangentVelocityBindGroups: [GPUBindGroup, GPUBindGroup],
    private extrapolateMPipeline: GPUComputePipeline,
    private extrapolateMBindGroups: [GPUBindGroup, GPUBindGroup],
  ) { }

  static async create(device: GPUDevice, fluid: Fluid) {
    const simCfg = fluid.simCfg;
    // Set boundary velocity and pressure

    const setBoundaryNormalVelocityAndPressurePipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/boundaryHandler.wgsl',
      {
        workgroupSizeX: simCfg.workgroupSizeX,
        workgroupSizeY: simCfg.workgroupSizeY,
        numX: simCfg.numX,
        numY: simCfg.numY,
      },
      'Set boundary vel and p',
      'setBoundaryNormalVelocityAndPressure'
    );
    const setBoundaryNormalVelocityAndPressureBindGroups = [0, 1].map(i => createBindGroup(
      device,
      setBoundaryNormalVelocityAndPressurePipeline,
      [fluid.u[i], fluid.v[i], fluid.p, fluid.e, fluid.b],
      `Set boundary vel and p bind group ${i}`
    )) as [GPUBindGroup, GPUBindGroup];

    // Extrapolation of velocity and density

    const setBoundaryTangentVelocityPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/boundaryHandler.wgsl',
      {
        workgroupSizeX: simCfg.workgroupSizeX,
        workgroupSizeY: simCfg.workgroupSizeY,
        numX: simCfg.numX,
        numY: simCfg.numY,
      },
      'Set boundary tangent velocity',
      'setBoundaryTangentVelocity'
    );
    const setBoundaryTangentVelocityBindGroups = [0, 1].map(i => device.createBindGroup({
      label: `Set boundary velocity bind group ${i}`,
      layout: setBoundaryTangentVelocityPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: fluid.u[i] }
      }, {
        binding: 1,
        resource: { buffer: fluid.v[i] }
      }, {
        binding: 4,
        resource: { buffer: fluid.b }
      }]
    })) as [GPUBindGroup, GPUBindGroup];

    // Extrapolation of dust density from fluid cells to solid ones

    const extrapolateMPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/boundaryHandler.wgsl',
      {
        workgroupSizeX: simCfg.workgroupSizeX,
        workgroupSizeY: simCfg.workgroupSizeY,
        numX: simCfg.numX,
        numY: simCfg.numY,
      },
      'Extrapolate demsity',
      'extrapolateM'
    );
    const extrapolateMBindGroups = [0, 1].map(i => device.createBindGroup({
      label: `Set boundary velocity bind group ${i}`,
      layout: extrapolateMPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 4,
        resource: { buffer: fluid.b }
      }, {
        binding: 5,
        resource: { buffer: fluid.m[i] }
      }]
    })) as [GPUBindGroup, GPUBindGroup];

    return new BoundaryHandler(
      fluid,
      setBoundaryNormalVelocityAndPressurePipeline,
      setBoundaryNormalVelocityAndPressureBindGroups,
      setBoundaryTangentVelocityPipeline,
      setBoundaryTangentVelocityBindGroups,
      extrapolateMPipeline,
      extrapolateMBindGroups
    );
  }

  destroyResources(): void { }

  setBoundaryVelAndP(commandEncoder: GPUCommandEncoder): void {
    executeComputePass(
      commandEncoder,
      this.setBoundaryNormalVelocityAndPressurePipeline,
      this.setBoundaryNormalVelocityAndPressureBindGroups[this.fluid.pingPongIndexVel],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  extrapolateVel(commandEncoder: GPUCommandEncoder): void {
    // Think twice about this indexing!
    executeComputePass(
      commandEncoder,
      this.setBoundaryTangentVelocityPipeline,
      this.setBoundaryTangentVelocityBindGroups[this.fluid.pingPongIndexVel],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  extrapolateM(commandEncoder: GPUCommandEncoder): void {
    // Think twice about this indexing!
    executeComputePass(
      commandEncoder,
      this.extrapolateMPipeline,
      this.extrapolateMBindGroups[this.fluid.pingPongIndexM],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }
}