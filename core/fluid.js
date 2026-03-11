import { SDFBuilder } from './SDFBuilder.js';
export var CellType;
(function (CellType) {
    CellType[CellType["Fluid"] = 0] = "Fluid";
    CellType[CellType["Inflow"] = 1] = "Inflow";
    CellType[CellType["Outflow"] = 2] = "Outflow";
    CellType[CellType["SolidFreeSlip"] = 3] = "SolidFreeSlip";
    CellType[CellType["SolidNoSlip"] = 4] = "SolidNoSlip";
    CellType[CellType["OutflowMembrane"] = 5] = "OutflowMembrane";
})(CellType || (CellType = {}));
export var IntegrationMethod;
(function (IntegrationMethod) {
    IntegrationMethod[IntegrationMethod["Euler"] = 0] = "Euler";
    IntegrationMethod[IntegrationMethod["Midpoint"] = 1] = "Midpoint";
})(IntegrationMethod || (IntegrationMethod = {}));
// This is kind of singleton of the simulation. Contains all simulation parameters and data.
export class Fluid {
    simCfg;
    workgroupCountX;
    workgroupCountY;
    // Ping pong index for buffers that have old(current) and new variants.
    // We need to export both buffers because bind groups must be created in advance for concrete buffers.
    pingPongIndexVel = 0;
    // GPU buffers
    u;
    v;
    p;
    // For convenience, force horizontal components are given at u positions (centers of vertical cells),
    // and forve vertical components are gives at v positions (centers of horizontal cells).
    // So there is no point at which the exact value of force is known.
    // Force over unit mass. I.e. f/\rho
    fu;
    fv;
    // Boundary information
    //b: Array<CellType>;
    b;
    pingPongIndexM = 0;
    m;
    // Emission.
    // For inflow cells it's the (normal) velocity on their edges.
    // For fluid cells it's the density change velocity at this cell.
    e;
    // Signed distance (to the boundary) function
    d;
    device;
    bufferSizeBytes;
    //constructor(device: GPUDevice, numX: number, numY: number, h: number
    //, integrationMethod: IntegrationMethod
    constructor(device, simCfg, initialConditions) {
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
    destroyResources() {
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
    createBuffer(label) {
        return this.device.createBuffer({
            label: label,
            size: this.bufferSizeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }
    isIndexOOB(i, j) {
        return (i < 0 || i > this.simCfg.numX - 1 ||
            j < 0 || j > this.simCfg.numY - 1);
    }
    cellIndex(x, y) {
        // For debug only.
        if (this.isIndexOOB(x, y)) {
            throw new Error(`Index ${x}, ${y} is out of bounds`);
        }
        return y * this.simCfg.numX + x;
    }
    setInitialConditions(ic, sdf) {
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
