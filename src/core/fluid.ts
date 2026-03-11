import { InitialConditions } from './initialConditions.js';
import { SDFBuilder } from './SDFBuilder.js';

export enum CellType {
  Fluid = 0,  // This two contain mass
  Inflow, //
  Outflow,
  SolidFreeSlip,  // This two are solid
  SolidNoSlip,    //
  OutflowMembrane
}

export enum IntegrationMethod {
  Euler = 0,
  Midpoint = 1,
}

export type SimulationConfig = {
  numX: number,  // simulation width
  numY: number,  // simulation height
  dx: number,   // m(eters)
  dt: number,   // s(econds)

  workgroupSizeX: number,
  workgroupSizeY: number,

  integrationMethod: IntegrationMethod,

  clampBacktrace: true,

  poissonIterations: number,
  poissonRelaxationFactor: number,

  kinematicViscosity: number,
  diffusionIterations: number,
  diffusionRelaxationFactor: number,

  dustExponentialDecayConstant: number,
}

// This is kind of singleton of the simulation. Contains all simulation parameters and data.
export class Fluid {
  readonly simCfg: SimulationConfig;
  readonly workgroupCountX: number;
  readonly workgroupCountY: number;

  // Ping pong index for buffers that have old(current) and new variants.
  // We need to export both buffers because bind groups must be created in advance for concrete buffers.
  pingPongIndexVel: number = 0;
  // GPU buffers
  u: [GPUBuffer, GPUBuffer];
  v: [GPUBuffer, GPUBuffer];

  p: GPUBuffer;

  // For convenience, force horizontal components are given at u positions (centers of vertical cells),
  // and forve vertical components are gives at v positions (centers of horizontal cells).
  // So there is no point at which the exact value of force is known.
  // Force over unit mass. I.e. f/\rho
  fu: GPUBuffer;
  fv: GPUBuffer;

  // Boundary information
  //b: Array<CellType>;
  b: GPUBuffer;

  pingPongIndexM: number = 0;
  m: [GPUBuffer, GPUBuffer];

  // Emission.
  // For inflow cells it's the (normal) velocity on their edges.
  // For fluid cells it's the density change velocity at this cell.
  e: GPUBuffer;

  // Signed distance (to the boundary) function
  d: GPUBuffer;

  private device: GPUDevice;
  private bufferSizeBytes: number;

  //constructor(device: GPUDevice, numX: number, numY: number, h: number
    //, integrationMethod: IntegrationMethod
  constructor(device: GPUDevice, simCfg: SimulationConfig, initialConditions: InitialConditions) {
    this.device = device;
    this.simCfg = simCfg;
    this.workgroupCountX = Math.ceil(simCfg.numX / simCfg.workgroupSizeX);
    this.workgroupCountY = Math.ceil(simCfg.numY / simCfg.workgroupSizeY);

    const numCells = simCfg.numX * simCfg.numY;
    const floatSizeBytes = 4;
    this.bufferSizeBytes = floatSizeBytes * numCells;

    this.u = [this.createBuffer('Velocity u component 1'), this.createBuffer('Velocity u component 2')];
    this.v = [this.createBuffer('Velocity v component 1'), this.createBuffer('Velocity v component 2')];

    this.p = this.createBuffer('Pressure');

    this.fu = this.createBuffer('Force u component applied the center of the vertical edge');
    this.fv = this.createBuffer('Force v component applied the center of the horizontal edge');

    this.e = this.createBuffer('Inflow velocity (matters in inflow cells)');

    this.m = [this.createBuffer('Dust density 1'), this.createBuffer('Dust density 2')];

    // Note that it's not f32 but u32 buffer. But such buffers have same size.
    this.b = this.createBuffer('Boundary information');

    this.d = this.createBuffer('SDF');

    const sdf = new SDFBuilder(initialConditions.b, initialConditions.numX, initialConditions.numY).sdf;
    this.setInitialConditions(initialConditions, sdf);
  }

  destroyResources(): void {
    this.u.forEach(buffer => buffer.destroy());
    this.v.forEach(buffer => buffer.destroy());

    this.p.destroy();

    this.fu.destroy();
    this.fv.destroy();

    this.e.destroy();

    this.m.forEach(buffer => buffer.destroy());

    this.b.destroy();

    this.d.destroy();
  }

  createBuffer(label: string): GPUBuffer {
    return this.device.createBuffer({
      label: label,
      size: this.bufferSizeBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  isIndexOOB(i: number, j: number): boolean {
    return (
      i < 0 || i > this.simCfg.numX - 1 ||
      j < 0 || j > this.simCfg.numY - 1
    );
  }

  cellIndex(x: number, y: number): number {
    // For debug only.
    if (this.isIndexOOB(x, y)) {
      throw new Error(`Index ${x}, ${y} is out of bounds`);
    }

    return y * this.simCfg.numX + x;
  }

  private setInitialConditions(ic: InitialConditions, sdf: Float32Array): void {
    if (this.simCfg.numX != ic.numX || this.simCfg.numY != ic.numY) {
      throw new Error(`Simulation size (${this.simCfg.numX}, ${this.simCfg.numY}) does not match with initial condition size (${ic.numX}, ${ic.numY})`);
    }

    const queue = this.device.queue;

    queue.writeBuffer(this.u[this.pingPongIndexVel], 0, ic.u.buffer);
    queue.writeBuffer(this.v[this.pingPongIndexVel], 0, ic.v.buffer);

    // Set initial p to zero
    {
      const numCells = ic.numX * ic.numY;
      const p = new Float32Array(numCells);
      p.fill(0.0);
      queue.writeBuffer(this.p, 0, p.buffer);
    }

    queue.writeBuffer(this.fu, 0, ic.fu.buffer);
    queue.writeBuffer(this.fv, 0, ic.fv.buffer);

    queue.writeBuffer(this.b, 0, ic.b.buffer);

    queue.writeBuffer(this.m[this.pingPongIndexM], 0, ic.m.buffer);

    queue.writeBuffer(this.e, 0, ic.e.buffer);

    queue.writeBuffer(this.d, 0, sdf.buffer);
  }
}
