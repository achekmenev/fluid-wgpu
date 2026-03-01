import { Fluid } from '../fluid.js';
import { PipelineBuilder, executeComputePass, createBindGroup } from '../../util/utilGPU.js'
import { PoissonSolver } from './poissonSolver.js';
import { BoundaryHandler } from './boundaryHandler.js';

// Make solver interface?

export class ProjectionSolver {
  private constructor(
    private fluid: Fluid,
    private boundaryHandler: BoundaryHandler,
    private divMulipliedByHH: GPUBuffer,
    private computeDivergencePipeline: GPUComputePipeline,
    private computeDivergenceBindGroups: [GPUBindGroup, GPUBindGroup],
    private poissonSolver: PoissonSolver,
    private correctVelocityPipeline: GPUComputePipeline,
    private correctVelocityBindGroups: [GPUBindGroup, GPUBindGroup],
  ) { }

  static async create(device: GPUDevice, fluid: Fluid) {
    const simCfg = fluid.simCfg;
    // Set boundary velocity and pressure

    const boundaryHandler = await BoundaryHandler.create(device, fluid);

    // Compute divergence
    const divMulipliedByHH = fluid.createBuffer('Velocity divergence');
    const computeDivergencePipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/computeDivergence.wgsl',
      {
        workgroupSizeX: simCfg.workgroupSizeX,
        workgroupSizeY: simCfg.workgroupSizeY,
        numX: simCfg.numX,
        numY: simCfg.numY,
        h: simCfg.dx
      },
      'Divergence compute pipeline'
    );
    const computeDivergenceBindGroups = [0, 1].map(i => createBindGroup(
      device,
      computeDivergencePipeline,
      [fluid.u[i], fluid.v[i], divMulipliedByHH],
      'Force solver bind group'
    )) as [GPUBindGroup, GPUBindGroup];

    // Solve pressure

    const poissonSolver = await PoissonSolver.create(device, fluid, divMulipliedByHH);

    // Correct velocity

    const correctVelocityPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/correctVelocity.wgsl',
      {
        workgroupSizeX: simCfg.workgroupSizeX,
        workgroupSizeY: simCfg.workgroupSizeY,
        numX: simCfg.numX,
        numY: simCfg.numY,
        h: simCfg.dx
      },
      'Divergence compute pipeline'
    );
    const correctVelocityBindGroups = [0, 1].map(i => createBindGroup(
      device,
      correctVelocityPipeline,
      [fluid.u[i], fluid.v[i], fluid.p, fluid.b],
      'Force solver bind group'
    )) as [GPUBindGroup, GPUBindGroup];

    return new ProjectionSolver(
      fluid,
      boundaryHandler,
      divMulipliedByHH,
      computeDivergencePipeline,
      computeDivergenceBindGroups,
      poissonSolver,
      correctVelocityPipeline,
      correctVelocityBindGroups,
    );
  }

  destroyResources(): void {
    this.boundaryHandler.destroyResources();
    this.divMulipliedByHH.destroy();
    this.poissonSolver.destroyResources();
  }

  projectVelAndExtrapolateVelAndM(commandEncoder: GPUCommandEncoder): void {
    this.boundaryHandler.setBoundaryVelAndP(commandEncoder);
    this.setDivergence(commandEncoder);
    this.poissonSolver.solveP(commandEncoder);
    this.correctVelocity(commandEncoder);

    //this.boundaryHandler.extrapolateVelAndM(commandEncoder);
    this.boundaryHandler.extrapolateVel(commandEncoder);
    this.boundaryHandler.extrapolateM(commandEncoder);
  }

  private setDivergence(commandEncoder: GPUCommandEncoder): void {
    executeComputePass(
      commandEncoder,
      this.computeDivergencePipeline,
      this.computeDivergenceBindGroups[this.fluid.pingPongIndexVel],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }

  private correctVelocity(commandEncoder: GPUCommandEncoder): void {
    executeComputePass(
      commandEncoder,
      this.correctVelocityPipeline,
      this.correctVelocityBindGroups[this.fluid.pingPongIndexVel],
      this.fluid.workgroupCountX,
      this.fluid.workgroupCountY
    );
  }
}