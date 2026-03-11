import { PipelineBuilder, createBindGroup } from '../util/utilGPU.js';
// Make solver interface?
export class AdvectionSolver {
    fluid;
    pipelineVel;
    bindGroupsVel;
    advectAndEmitDustPipeline;
    advectAndEmitDustBindGroups;
    constructor(fluid, pipelineVel, bindGroupsVel, advectAndEmitDustPipeline, advectAndEmitDustBindGroups) {
        this.fluid = fluid;
        this.pipelineVel = pipelineVel;
        this.bindGroupsVel = bindGroupsVel;
        this.advectAndEmitDustPipeline = advectAndEmitDustPipeline;
        this.advectAndEmitDustBindGroups = advectAndEmitDustBindGroups;
    }
    static async create(device, fluid) {
        const simCfg = fluid.simCfg;
        // Advect velocity
        const advectVelocityPipeline = await PipelineBuilder.createComputePipeline(device, './core/advectionSolver.wgsl', {
            workgroupSizeX: simCfg.workgroupSizeX,
            workgroupSizeY: simCfg.workgroupSizeY,
            numX: simCfg.numX,
            numY: simCfg.numY,
            dtOverH: simCfg.dt / simCfg.dx,
            integrationMethod: simCfg.integrationMethod,
            isClampBacktrace: simCfg.clampBacktrace ? 1 : 0
        }, 'Force solver compute pipeline', 'advectVelocity');
        const advectVelocityBindGroups = [0, 1].map(i => createBindGroup(device, advectVelocityPipeline, [
            fluid.u[i],
            fluid.v[i],
            fluid.u[1 - i],
            fluid.v[1 - i],
            fluid.b,
            fluid.d
        ], `Advect velocity bind group ${i}`));
        // Advect and emit dust
        const advectAndEmitDustPipeline = await PipelineBuilder.createComputePipeline(device, './core/advectionSolver.wgsl', {
            workgroupSizeX: simCfg.workgroupSizeX,
            workgroupSizeY: simCfg.workgroupSizeY,
            numX: simCfg.numX,
            numY: simCfg.numY,
            dtOverH: simCfg.dt / simCfg.dx,
            dt: simCfg.dt,
            integrationMethod: simCfg.integrationMethod,
            // Implicit Euler exponential decay
            dustDecayMult: 1.0 / (1.0 + simCfg.dustExponentialDecayConstant * simCfg.dt),
        }, 'Advect and emit dust', 'advectAndEmitDust');
        // There are 2 ping-pong values for velocity components and 2 ping-pong values for dust density.
        // So there are total 2*2 bind groups...
        // Think twice about this indexing!
        let advectAndEmitDustBindGroups = [];
        for (let pingPongVel = 0; pingPongVel < 2; ++pingPongVel) {
            for (let pingPongM = 0; pingPongM < 2; ++pingPongM) {
                const bindGroup = device.createBindGroup({
                    label: `Advect and emit dust bind group; velId: ${pingPongVel}, mId: ${pingPongM}`,
                    layout: advectAndEmitDustPipeline.getBindGroupLayout(0),
                    entries: [{
                            binding: 0,
                            resource: { buffer: fluid.u[pingPongVel] }
                        }, {
                            binding: 1,
                            resource: { buffer: fluid.v[pingPongVel] }
                        }, {
                            binding: 4,
                            resource: { buffer: fluid.b }
                        }, {
                            binding: 5,
                            resource: { buffer: fluid.d }
                        }, {
                            binding: 6,
                            resource: { buffer: fluid.m[pingPongM] }
                        }, {
                            binding: 7,
                            resource: { buffer: fluid.m[1 - pingPongM] }
                        }, {
                            binding: 8,
                            resource: { buffer: fluid.e }
                        },]
                });
                advectAndEmitDustBindGroups.push(bindGroup);
            }
        }
        return new AdvectionSolver(fluid, advectVelocityPipeline, advectVelocityBindGroups, advectAndEmitDustPipeline, advectAndEmitDustBindGroups);
    }
    destroyResources() {
        // Cleanup when no longer needed
        //this.pipeline = null!; // Let GC handle it (no explicit destroy method)
        //this.bindGroup = null!; // WTF? non-null assertion
        // pingPongU[1] is the newU created by the AdvectionSolver.
        // pingPongU[0] is the u created by Fluid. So it's destroyed there.
        //this.pingPongU[(this.pingPongIndex + 1) % 2].destroy();
        //this.pingPongV[(this.pingPongIndex + 1) % 2].destroy();
    }
    advectVelocity(commandEncoder) {
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipelineVel);
        pass.setBindGroup(0, this.bindGroupsVel[this.fluid.pingPongIndexVel]);
        pass.dispatchWorkgroups(this.fluid.workgroupCountX, this.fluid.workgroupCountY);
        pass.end();
        this.fluid.pingPongIndexVel = 1 - this.fluid.pingPongIndexVel;
    }
    advectAndEmitDust(commandEncoder) {
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.advectAndEmitDustPipeline);
        //pass.setBindGroup(0, this.advectAndEmitDustBindGroups[this.fluid.pingPongIndexM]);
        // Think twice about this indexing!
        const bindGroupIndex = this.fluid.pingPongIndexM + 2 * this.fluid.pingPongIndexVel;
        pass.setBindGroup(0, this.advectAndEmitDustBindGroups[bindGroupIndex]);
        pass.dispatchWorkgroups(this.fluid.workgroupCountX, this.fluid.workgroupCountY);
        pass.end();
        this.fluid.pingPongIndexM = 1 - this.fluid.pingPongIndexM;
    }
}
