import { executeComputePass, PipelineBuilder } from '../util/utilGPU.js';
import { MinMaxReducer } from './minMaxReducer.js';
export class RendererToTexture {
    device;
    fluid;
    renderConfig;
    vectorStaggeredToTexturePipeline;
    scalarToTexturePipeline;
    borderToTexturePipeline;
    velocityMinMaxBuffer;
    velocityToTextureBindGroups;
    pressureMinMaxBuffer;
    pressureToTextureBindGroup;
    dustMinMaxBuffer;
    dustToTextureBindGroups;
    borderToTextureBindGroup;
    sdfMinMaxBuffer;
    sdfToTextureBindGroup;
    forceMinMaxBuffer;
    forceToTextureBindGroup;
    uniformValues = new Float32Array(2);
    constructor(device, fluid, renderConfig, 
    //private uniformBuffer: GPUBuffer,
    vectorStaggeredToTexturePipeline, scalarToTexturePipeline, borderToTexturePipeline, velocityMinMaxBuffer, velocityToTextureBindGroups, 
    //private pressureMinMaxReducer: MinMaxReducer,
    pressureMinMaxBuffer, pressureToTextureBindGroup, 
    // Ping-pong reducers and bind groups
    //private dustMinMaxReducers: MinMaxReducer[],
    dustMinMaxBuffer, dustToTextureBindGroups, borderToTextureBindGroup, 
    //private sdfMinMaxReducer: MinMaxReducer,
    sdfMinMaxBuffer, sdfToTextureBindGroup, forceMinMaxBuffer, forceToTextureBindGroup) {
        this.device = device;
        this.fluid = fluid;
        this.renderConfig = renderConfig;
        this.vectorStaggeredToTexturePipeline = vectorStaggeredToTexturePipeline;
        this.scalarToTexturePipeline = scalarToTexturePipeline;
        this.borderToTexturePipeline = borderToTexturePipeline;
        this.velocityMinMaxBuffer = velocityMinMaxBuffer;
        this.velocityToTextureBindGroups = velocityToTextureBindGroups;
        this.pressureMinMaxBuffer = pressureMinMaxBuffer;
        this.pressureToTextureBindGroup = pressureToTextureBindGroup;
        this.dustMinMaxBuffer = dustMinMaxBuffer;
        this.dustToTextureBindGroups = dustToTextureBindGroups;
        this.borderToTextureBindGroup = borderToTextureBindGroup;
        this.sdfMinMaxBuffer = sdfMinMaxBuffer;
        this.sdfToTextureBindGroup = sdfToTextureBindGroup;
        this.forceMinMaxBuffer = forceMinMaxBuffer;
        this.forceToTextureBindGroup = forceToTextureBindGroup;
    }
    static async create(device, textureView, fluid, renderConfig) {
        const simSfg = fluid.simCfg;
        const constants = {
            workgroupSizeX: simSfg.workgroupSizeX,
            workgroupSizeY: simSfg.workgroupSizeY,
            numX: simSfg.numX,
            numY: simSfg.numY,
        };
        const vectorStaggeredToTexturePipeline = await PipelineBuilder.createComputePipeline(device, './render/vectorStaggeredToTexture.wgsl', constants, 'Vector staggered to texture');
        const scalarToTexturePipeline = await PipelineBuilder.createComputePipeline(device, './render/scalarToTexture.wgsl', constants, 'Scalar to texture');
        const borderToTexturePipeline = await PipelineBuilder.createComputePipeline(device, './render/borderToTexture.wgsl', constants, 'Border to texture');
        const velocityMinMaxBuffer = device.createBuffer({
            label: 'Uniforms min and max',
            size: 2 * 4, // 2 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const velocityToTextureBindGroups = [0, 1].map(i => device.createBindGroup({
            label: `Compute to texture renderer ${i}`,
            layout: vectorStaggeredToTexturePipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.u[i] }
                }, {
                    binding: 1,
                    resource: { buffer: fluid.v[i] }
                }, {
                    binding: 2,
                    resource: textureView
                }, {
                    binding: 3,
                    resource: { buffer: velocityMinMaxBuffer }
                }]
        }));
        const numCells = fluid.simCfg.numX * fluid.simCfg.numY;
        const pressureMinMaxReducer = new MinMaxReducer(device, fluid.p, numCells);
        /*//// Bind group for uniforms
        //
        // Create a buffer for the uniform values
        const uniformBufferSize = 2 * 4; // 2 floats
        const uniformBuffer = device.createBuffer({
          label: 'Uniforms min and max',
          size: uniformBufferSize,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Create a typed array to hold the values for the uniforms in JavaScript
        const uniformValues = new Float32Array(uniformBufferSize / 4);
        //
        //// Bind group for uniforms
        */
        const pressureMinMaxBuffer = device.createBuffer({
            label: 'Uniforms min and max',
            size: 2 * 4, // 2 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const pressureToTextureBindGroup = device.createBindGroup({
            label: 'Compute to Texture renderer ',
            layout: scalarToTexturePipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.p }
                }, {
                    binding: 1,
                    resource: textureView
                }, {
                    binding: 2,
                    resource: { buffer: pressureMinMaxBuffer }
                } /*, {
                  binding: 2,
                  resource: { buffer: pressureMinMaxReducer.intermediateBuffers[pressureMinMaxReducer.intermediateBuffers.length - 1] }
                }*/
            ]
        });
        //const dustMinMaxReducers = [0, 1].map(i =>
        //  new MinMaxReducer(device, fluid.m[i], numCells)
        //);
        const dustMinMaxBuffer = device.createBuffer({
            label: 'Uniforms min and max',
            size: 2 * 4, // 2 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const dustToTextureBindGroups = [0, 1].map(i => device.createBindGroup({
            label: 'Compute to Texture renderer ',
            layout: scalarToTexturePipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.m[i] }
                }, {
                    binding: 1,
                    resource: textureView
                }, {
                    binding: 2,
                    resource: { buffer: dustMinMaxBuffer }
                } /*, {
                  binding: 2,
                  resource: { buffer: dustMinMaxReducers[i].intermediateBuffers[dustMinMaxReducers[i].intermediateBuffers.length - 1] }
                }*/
            ]
        }));
        const borderToTextureBindGroup = device.createBindGroup({
            label: 'Compute to Texture renderer ',
            layout: borderToTexturePipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.b }
                }, {
                    binding: 1,
                    resource: textureView
                }]
        });
        //const sdfMinMaxReducer = new MinMaxReducer(device, fluid.d, numCells);
        const sdfMinMaxBuffer = device.createBuffer({
            label: 'Uniforms min and max',
            size: 2 * 4, // 2 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const sdfToTextureBindGroup = device.createBindGroup({
            label: 'Compute to Texture renderer ',
            layout: scalarToTexturePipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.d }
                }, {
                    binding: 1,
                    resource: textureView
                }, {
                    binding: 2,
                    resource: { buffer: sdfMinMaxBuffer }
                } /*, {
                  binding: 2,
                  resource: { buffer: sdfMinMaxReducer.intermediateBuffers[sdfMinMaxReducer.intermediateBuffers.length - 1] }
                }*/
            ]
        });
        const forceMinMaxBuffer = device.createBuffer({
            label: 'Uniforms min and max',
            size: 2 * 4, // 2 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const forceToTextureBindGroup = device.createBindGroup({
            label: `Compute to texture renderer`,
            layout: vectorStaggeredToTexturePipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.fu }
                }, {
                    binding: 1,
                    resource: { buffer: fluid.fv }
                }, {
                    binding: 2,
                    resource: textureView
                }, {
                    binding: 3,
                    resource: { buffer: forceMinMaxBuffer }
                }]
        });
        return new RendererToTexture(device, fluid, renderConfig, vectorStaggeredToTexturePipeline, scalarToTexturePipeline, borderToTexturePipeline, velocityMinMaxBuffer, velocityToTextureBindGroups, 
        //pressureMinMaxReducer,
        pressureMinMaxBuffer, pressureToTextureBindGroup, 
        //dustMinMaxReducers,
        dustMinMaxBuffer, dustToTextureBindGroups, borderToTextureBindGroup, 
        //sdfMinMaxReducer,
        sdfMinMaxBuffer, sdfToTextureBindGroup, forceMinMaxBuffer, forceToTextureBindGroup);
    }
    setMinMaxScalar(buffer, min, max) {
        this.uniformValues[0] = min;
        this.uniformValues[1] = max;
        this.device.queue.writeBuffer(buffer, 0, this.uniformValues);
    }
    renderVelocity(commandEncoder) {
        this.setMinMaxScalar(this.velocityMinMaxBuffer, this.renderConfig.velocityMin, this.renderConfig.velocityMax);
        executeComputePass(commandEncoder, this.vectorStaggeredToTexturePipeline, this.velocityToTextureBindGroups[this.fluid.pingPongIndexVel], this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
    renderPressure(commandEncoder) {
        //this.pressureMinMaxReducer.computeMinMax(commandEncoder);
        //this.setMinMaxScalar(-0.1, 0.1);
        //this.uniformValues[0] = -0.1;
        //this.uniformValues[1] = 0.1;
        //this.device.queue.writeBuffer(this.pressureMinMaxBuffer, 0, this.uniformValues);
        this.setMinMaxScalar(this.pressureMinMaxBuffer, this.renderConfig.pressureMin, this.renderConfig.pressureMax);
        executeComputePass(commandEncoder, this.scalarToTexturePipeline, this.pressureToTextureBindGroup, this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
    renderDust(commandEncoder) {
        //this.setMinMaxScalar(0.0, 1.0);
        //this.uniformValues[0] = 0.0;
        //this.uniformValues[1] = 1.0;
        //this.device.queue.writeBuffer(this.dustMinMaxBuffer, 0, this.uniformValues);
        this.setMinMaxScalar(this.dustMinMaxBuffer, this.renderConfig.dustMin, this.renderConfig.dustMax);
        executeComputePass(commandEncoder, this.scalarToTexturePipeline, this.dustToTextureBindGroups[this.fluid.pingPongIndexM], this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
    renderBorder(commandEncoder) {
        executeComputePass(commandEncoder, this.borderToTexturePipeline, this.borderToTextureBindGroup, this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
    renderSDF(commandEncoder) {
        //this.sdfMinMaxReducer.computeMinMax(commandEncoder);
        //this.setMinMaxScalar(-10.0, 10.0);
        //this.uniformValues[0] = -10.0;
        //this.uniformValues[1] = 10.0;
        //this.device.queue.writeBuffer(this.sdfMinMaxBuffer, 0, this.uniformValues);
        const simCfg = this.fluid.simCfg;
        const minDist = Math.min(simCfg.numX, simCfg.numY);
        this.setMinMaxScalar(this.sdfMinMaxBuffer, -0.5 * minDist, 0.5 * minDist);
        executeComputePass(commandEncoder, this.scalarToTexturePipeline, this.sdfToTextureBindGroup, this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
    renderForce(commandEncoder) {
        this.setMinMaxScalar(this.forceMinMaxBuffer, this.renderConfig.forceMin, this.renderConfig.forceMax);
        executeComputePass(commandEncoder, this.vectorStaggeredToTexturePipeline, this.forceToTextureBindGroup, this.fluid.workgroupCountX, this.fluid.workgroupCountY);
    }
}
export function textureToScreen(context, commandEncoder, renderPipeline, renderBindGroup) {
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const renderPassDescriptor = {
        label: 'Texture to Screen',
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                clearValue: [0.3, 0.3, 0.3, 0], // Clear to transparent
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };
    // Execute render pass
    const pass = commandEncoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderBindGroup);
    pass.draw(6); // call the vertex shader 6 times
    pass.end();
}
