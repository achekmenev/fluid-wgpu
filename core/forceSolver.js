import { PipelineBuilder, executeComputePass, createBindGroup } from '../util/utilGPU.js';
// Make solver interface?
export class ForceSolver {
    fluid;
    pipeline;
    bindGroups;
    constructor(fluid, pipeline, bindGroups) {
        this.fluid = fluid;
        this.pipeline = pipeline;
        this.bindGroups = bindGroups;
    }
    static async create(device, fluid) {
        const simCfg = fluid.simCfg;
        const computePipeline = await PipelineBuilder.createComputePipeline(device, './core/forceSolver.wgsl', {
            workgroupSizeX: simCfg.workgroupSizeX,
            workgroupSizeY: simCfg.workgroupSizeY,
            numX: simCfg.numX,
            numY: simCfg.numY,
            //dtOverRho: config.dt / fluid.density,
            dt: simCfg.dt
        }, 'Force solver compute pipeline');
        const bindGroups = [0, 1].map(i => createBindGroup(device, computePipeline, [fluid.u[i], fluid.v[i], fluid.fu, fluid.fv, fluid.b], `Force solver bind group ${i}`));
        return new ForceSolver(fluid, computePipeline, bindGroups);
    }
    destroyResources() {
        // Cleanup when no longer needed
        //this.pipeline = null!; // Let GC handle it (no explicit destroy method)
        //this.bindGroups = null!; // WTF? non-null assertion
    }
    applyForce(commandEncoder) {
        executeComputePass(commandEncoder, this.pipeline, this.bindGroups[this.fluid.pingPongIndexVel], this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
}
