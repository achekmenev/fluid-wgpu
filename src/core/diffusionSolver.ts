import { Fluid } from './fluid.js';
import { PipelineBuilder, createBindGroup, executeComputePass } from '../util/utilGPU.js'

// Make solver interface?

export class DiffusionSolver {
  private constructor(
    private fluid: Fluid,
    private copyPipeline: GPUComputePipeline,
    private copyBindGroups: [GPUBindGroup, GPUBindGroup],
    private redPipeline: GPUComputePipeline,
    private redBindGroups: [GPUBindGroup, GPUBindGroup],
    private blackPipeline: GPUComputePipeline,
    private blackBindGroups: [GPUBindGroup, GPUBindGroup],
  ) { }

  static async create(device: GPUDevice, fluid: Fluid) {
    const simCfg = fluid.simCfg;

    const copyPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/diffusionSolverRBGSSOR.wgsl',
      {
        workgroupSizeX: simCfg.workgroupSizeX,
        workgroupSizeY: simCfg.workgroupSizeY,
        numX: simCfg.numX,
        numY: simCfg.numY,
      },
      'Copy velocities for diffusion',
      'copyVelocities'
    );
    const copyBindGroups = [0, 1].map(i => createBindGroup(
      device,
      copyPipeline, [
      fluid.u[i],
      fluid.v[i],
      fluid.u[1 - i],
      fluid.v[1 - i]
    ],
      `Copy velocities for diffusion ${i}`
    )) as [GPUBindGroup, GPUBindGroup];

    const k = (simCfg.kinematicViscosity / simCfg.dx) * (simCfg.dt / simCfg.dx);
    const offdiagonalCoefficient = k / (1.0 + 4.0 * k);
    const constantCoefficient = 1.0 / (1.0 + 4.0 * k);

    const redBlackConstants: Record<string, number> = {
      workgroupSizeX: simCfg.workgroupSizeX,
      workgroupSizeY: simCfg.workgroupSizeY,
      numX: simCfg.numX,
      numY: simCfg.numY,
      relaxationFactor: simCfg.diffusionRelaxationFactor,
      offdiagonalCoefficient,
      constantCoefficient
    };
    const redPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/diffusionSolverRBGSSOR.wgsl',
      redBlackConstants,
      'Red pass of RG GS SOR pipeline for diffusion',
      'redPass'
    );
    const blackPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/diffusionSolverRBGSSOR.wgsl',
      redBlackConstants,
      'Black pass of RG GS SOR pipeline for diffusion',
      'blackPass'
    );

    const redBlackBuffers = [0, 1].map(i => [
      fluid.u[i],
      fluid.v[i],
      fluid.u[1 - i],
      fluid.v[1 - i],
      fluid.b
    ]);
    const redBindGroups = [0, 1].map(i => createBindGroup(
      device,
      redPipeline,
      redBlackBuffers[i],
      `Red pass GS SOR for diffusion bind group ${i}`
    )) as [GPUBindGroup, GPUBindGroup];

    const blackBindGroups = [0, 1].map(i => createBindGroup(
      device,
      blackPipeline,
      redBlackBuffers[i],
      `Black pass GS SOR for diffusion bind group ${i}`
    )) as [GPUBindGroup, GPUBindGroup];

    return new DiffusionSolver(
      fluid,
      copyPipeline, copyBindGroups,
      redPipeline, redBindGroups,
      blackPipeline, blackBindGroups
    );
  }

  destroyResources(): void { }

  diffuseVelocity(commandEncoder: GPUCommandEncoder): void {
    const fluid = this.fluid;
    const simCfg = fluid.simCfg;
    if (simCfg.kinematicViscosity == 0.0) {
      return;
    }

    const workgroupCountX = fluid.workgroupCountX;
    const workgroupCountY = fluid.workgroupCountY;

    // Copy velocity to newVelocity buffers
    executeComputePass(
      commandEncoder,
      this.copyPipeline,
      this.copyBindGroups[fluid.pingPongIndexVel],
      workgroupCountX,
      workgroupCountY
    );

    for (let iter = 0; iter < simCfg.diffusionIterations; ++iter) {
      executeComputePass(
        commandEncoder,
        this.redPipeline,
        this.redBindGroups[fluid.pingPongIndexVel],
        workgroupCountX,
        workgroupCountY
      );
      executeComputePass(
        commandEncoder,
        this.blackPipeline,
        this.blackBindGroups[fluid.pingPongIndexVel],
        workgroupCountX,
        workgroupCountY
      );
    }

    fluid.pingPongIndexVel = 1 - fluid.pingPongIndexVel;
  }
}