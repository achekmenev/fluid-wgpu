import { Fluid } from './core/fluid.js';
import { Simulation } from './core/simulation.js';

// TODO: class that owns Simulation and Renderer
export class SimulationManager {
  //simulation: Simulation;

  private constructor(
    //private simulation: Simulation
  ) { }

  static async create(
    device: GPUDevice,
    outputTextureView: GPUTextureView,
    computeToTexturePipeline: GPUComputePipeline,
  ) {

  }

  update(commandEncoder: GPUCommandEncoder): void {

  }

  renderToTexture(commandEncoder: GPUCommandEncoder): void {

  }
}