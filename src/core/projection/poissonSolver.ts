import { Fluid } from '../fluid.js';
import { PipelineBuilder, createBindGroup, executeComputePass } from '../../util/utilGPU.js'

// Make solver interface?

export class PoissonSolver {
  private constructor(
    private fluid: Fluid,
    private redPipeline: GPUComputePipeline,
    private redBindGroup: GPUBindGroup,
    private blackPipeline: GPUComputePipeline,
    private blackBindGroup: GPUBindGroup,
  ) { }

  static async create(device: GPUDevice, fluid: Fluid, divMulipliedByHH: GPUBuffer) {
    const simCfg = fluid.simCfg;

    const constants: Record<string, number> = {
      workgroupSizeX: simCfg.workgroupSizeX,
      workgroupSizeY: simCfg.workgroupSizeY,
      numX: simCfg.numX,
      numY: simCfg.numY,
      relaxationFactor: simCfg.poissonRelaxationFactor
    };

    const redPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/poissonSolverRBGSSOR.wgsl',
      constants,
      'Red pass of RG GS SOR pipeline',
      'redPass'
    );
    const blackPipeline = await PipelineBuilder.createComputePipeline(
      device,
      './core/projection/poissonSolverRBGSSOR.wgsl',
      constants,
      'Black pass of RG GS SOR pipeline',
      'blackPass'
    );

    const redBlackBuffers = [fluid.p, divMulipliedByHH, fluid.b];
    const redBindGroup = createBindGroup(
      device,
      redPipeline,
      redBlackBuffers,
      'Red pass GS SOR bind group'
    );
    const blackBindGroup = createBindGroup(
      device,
      blackPipeline,
      redBlackBuffers,
      'Black pass GS SOR bind group'
    );

    return new PoissonSolver(
      fluid,
      redPipeline, redBindGroup,
      blackPipeline, blackBindGroup,
    );
  }

  destroyResources(): void { }

  solveP(commandEncoder: GPUCommandEncoder): void {
    const numIterations = this.fluid.simCfg.poissonIterations;
    const workgroupCountX = this.fluid.workgroupCountX;
    const workgroupCountY = this.fluid.workgroupCountY;

    for (let iter = 0; iter < numIterations; ++iter) {
      executeComputePass(
        commandEncoder,
        this.redPipeline,
        this.redBindGroup,
        workgroupCountX,
        workgroupCountY
      );
      executeComputePass(
        commandEncoder,
        this.blackPipeline,
        this.blackBindGroup,
        workgroupCountX,
        workgroupCountY
      );
    }
  }
}