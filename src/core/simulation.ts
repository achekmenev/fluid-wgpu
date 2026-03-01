import { Fluid, SimulationConfig } from './fluid.js';
import { AdvectionSolver } from './advectionSolver.js';
import { DiffusionSolver } from './diffusionSolver.js';
import { ForceSolver } from './forceSolver.js';
import { ProjectionSolver } from './projection/projectionSolver.js'
import { config } from '../config.js';
import * as ic from './initialConditions.js';
import { SDFBuilder } from './SDFBuilder.js';

export class Simulation {
  private firstIteration = true;

  private constructor(
    public fluid: Fluid,
    private advectionSolver: AdvectionSolver,
    private diffusionSolver: DiffusionSolver,
    private forceSolver: ForceSolver,
    private projectionSolver: ProjectionSolver
  ) { }

  static async create(device: GPUDevice, simCfg: SimulationConfig, initialConditions: ic.InitialConditions): Promise<Simulation> {
    const fluid = new Fluid(device, simCfg, initialConditions);

    //const sdf = new SDFBuilder(initialConditions.b, initialConditions.numX, initialConditions.numY).sdf;
    //fluid.setInitialConditions(initialConditions, sdf);

    const advectionSolver = await AdvectionSolver.create(device, fluid);
    const diffusionSolver = await DiffusionSolver.create(device, fluid);
    const forceSolver = await ForceSolver.create(device, fluid);
    const projectionSolver = await ProjectionSolver.create(device, fluid);

    return new Simulation(
      fluid,
      advectionSolver,
      diffusionSolver,
      forceSolver,
      projectionSolver
    );
  }

  destroyResources(): void {
    this.fluid.destroyResources();

    this.advectionSolver.destroyResources();
    this.diffusionSolver.destroyResources();
    this.forceSolver.destroyResources();
    this.projectionSolver.destroyResources();
  }

  step(commandEncoder: GPUCommandEncoder): void {
    // To make sure we advect only divergence-free vector fields.
    // Plus we set boundary conditions for diffusion.
    if (this.firstIteration) {
      this.projectionSolver!.projectVelAndExtrapolateVelAndM(commandEncoder);
      this.firstIteration = false;
    }

    this.advectionSolver.advectVelocity(commandEncoder);
    this.diffusionSolver.diffuseVelocity(commandEncoder);
    this.forceSolver.applyForce(commandEncoder);
    this.projectionSolver.projectVelAndExtrapolateVelAndM(commandEncoder);

    this.advectionSolver.advectAndEmitDust(commandEncoder);
  }
}