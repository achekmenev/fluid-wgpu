import { loadText } from '../util/util.js';
import { PipelineBuilder, TextureManager } from '../util/utilGPU.js';
import { RendererToTexture, textureToScreen } from './RendererToTexture.js';
function createCanvas(label) {
    // making this
    // <div>
    //   <canvas></canvas>
    //   <div>`label`</div>
    // </div>
    const canvas = document.createElement('canvas');
    canvas.id = label;
    //canvas.width = width;
    //canvas.height = height;
    const container = document.createElement('div');
    container.className = 'canvas-container';
    const description = document.createElement('div');
    description.textContent = label;
    container.appendChild(canvas);
    container.appendChild(description);
    document.body.appendChild(container);
    return canvas;
}
function getWGPUContext(canvas) {
    const context = canvas.getContext('webgpu');
    if (!context) {
        throw new Error('Failed to get webgpu context');
    }
    return context;
}
export class Renderer {
    renderConfig;
    fluid;
    textureManager;
    rendererToTexture;
    renderPipeline;
    renderBindGroup;
    arrowRenderPipeline;
    arrowVelBindGroups;
    arrowFBindGroups;
    //rendererToTextore: RendererToTexture;
    // The order here is the order in which canvases are displayed
    static canvasVel = createCanvas('Abs velocity');
    static canvasDust = createCanvas('Dust density');
    static canvasP = createCanvas('Pressure correction');
    static canvasF = createCanvas('External force');
    static canvasBorder = createCanvas('Cell types');
    static canvasSDF = createCanvas('SDF');
    static canvases = [
        this.canvasVel,
        this.canvasDust,
        this.canvasP,
        this.canvasF,
        this.canvasBorder,
        this.canvasSDF
    ];
    static contextVel = getWGPUContext(this.canvasVel);
    static contextP = getWGPUContext(this.canvasP);
    static contextF = getWGPUContext(this.canvasF);
    static contextDust = getWGPUContext(this.canvasDust);
    static contextBorder = getWGPUContext(this.canvasBorder);
    static contextSDF = getWGPUContext(this.canvasSDF);
    static contexts = [
        this.contextVel,
        this.contextP,
        this.contextF,
        this.contextDust,
        this.contextSDF,
        this.contextBorder
    ];
    constructor(device, canvasTextureFormat, renderConfig, fluid, textureManager, rendererToTexture, renderPipeline, renderBindGroup, arrowRenderPipeline, arrowVelBindGroups, arrowFBindGroups) {
        this.renderConfig = renderConfig;
        this.fluid = fluid;
        this.textureManager = textureManager;
        this.rendererToTexture = rendererToTexture;
        this.renderPipeline = renderPipeline;
        this.renderBindGroup = renderBindGroup;
        this.arrowRenderPipeline = arrowRenderPipeline;
        this.arrowVelBindGroups = arrowVelBindGroups;
        this.arrowFBindGroups = arrowFBindGroups;
        Renderer.canvases.forEach(canvas => {
            canvas.width = fluid.simCfg.numX;
            canvas.height = fluid.simCfg.numY;
        });
        Renderer.contexts.forEach(context => {
            context.configure({
                device,
                format: canvasTextureFormat,
            });
        });
    }
    static async create(device, canvasTextureFormat, renderConfig, fluid) {
        const textureManager = TextureManager.create(device, fluid.simCfg.numX, fluid.simCfg.numY);
        const rendererToTexture = await RendererToTexture.create(device, textureManager.view, fluid, renderConfig);
        //// Render info
        //
        const renderPipeline = await PipelineBuilder.createRenderPipeline(device, './render/textureToScreen.wgsl', canvasTextureFormat, 'Textured quad pipeline');
        const renderBindGroup = device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: textureManager.view },
                { binding: 1, resource: textureManager.sampler },
            ],
        });
        //
        //// Render info
        const arrowShaderCode = await loadText('./render/arrow.wgsl');
        const arrowShaderModule = device.createShaderModule({
            label: 'Arrow shader',
            code: arrowShaderCode,
        });
        const arrowRenderPipeline = device.createRenderPipeline({
            label: 'Arrow pipeline',
            layout: 'auto',
            vertex: {
                module: arrowShaderModule,
                entryPoint: 'vs',
                constants: {
                    numX: fluid.simCfg.numX,
                    numY: fluid.simCfg.numY,
                    stride: renderConfig.arrowsStride,
                    unitLength: renderConfig.arrowsUnitLength
                }
            },
            fragment: {
                module: arrowShaderModule,
                entryPoint: 'fs',
                targets: [{ format: canvasTextureFormat }],
            },
            primitive: {
                topology: 'line-list', // or 'line-strip'
            },
        });
        const arrowVelBindGroups = [0, 1].map(i => device.createBindGroup({
            label: `Velocity arrow ${i}`,
            layout: arrowRenderPipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.u[i] }
                }, {
                    binding: 1,
                    resource: { buffer: fluid.v[i] }
                }, {
                    binding: 2,
                    resource: { buffer: fluid.b }
                }]
        }));
        const arrowFBindGroup = device.createBindGroup({
            label: `Force arrow`,
            layout: arrowRenderPipeline.getBindGroupLayout(0),
            entries: [{
                    binding: 0,
                    resource: { buffer: fluid.fu }
                }, {
                    binding: 1,
                    resource: { buffer: fluid.fv }
                }, {
                    binding: 2,
                    resource: { buffer: fluid.b }
                }]
        });
        return new Renderer(device, canvasTextureFormat, renderConfig, fluid, textureManager, rendererToTexture, renderPipeline, renderBindGroup, arrowRenderPipeline, arrowVelBindGroups, arrowFBindGroup);
    }
    destroy() {
        this.textureManager.texture.destroy();
        Renderer.contexts.forEach(context => {
            context.unconfigure();
        });
    }
    renderArrows(commandEncoder, context, bindGroup) {
        const stride = this.renderConfig.arrowsStride;
        const numPerX = Math.floor(this.fluid.simCfg.numX / stride);
        const numPerY = Math.floor(this.fluid.simCfg.numY / stride);
        const numArrows = numPerX * numPerY;
        const renderPassDescriptor = {
            label: 'Texture to Screen',
            colorAttachments: [{
                    //view: Renderer.contextVel.getCurrentTexture().createView(),
                    view: context.getCurrentTexture().createView(),
                    clearValue: [0.3, 0.3, 0.3, 0], // Clear to transparent
                    //loadOp: 'clear',
                    loadOp: 'load',
                    storeOp: 'store',
                }],
        };
        // Execute render pass
        const pass = commandEncoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(this.arrowRenderPipeline);
        //pass.setBindGroup(0, this.arrowVelBindGroups[this.fluid.pingPongIndexVel]);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, numArrows); // call the vertex shader 6 times
        pass.end();
    }
    renderAll(commandEncoder) {
        this.rendererToTexture.renderVelocity(commandEncoder);
        textureToScreen(Renderer.contextVel, commandEncoder, this.renderPipeline, this.renderBindGroup);
        if (this.renderConfig.drawArrows) {
            this.renderArrows(commandEncoder, Renderer.contextVel, this.arrowVelBindGroups[this.fluid.pingPongIndexVel]);
        }
        this.rendererToTexture.renderPressure(commandEncoder);
        textureToScreen(Renderer.contextP, commandEncoder, this.renderPipeline, this.renderBindGroup);
        this.rendererToTexture.renderForce(commandEncoder);
        textureToScreen(Renderer.contextF, commandEncoder, this.renderPipeline, this.renderBindGroup);
        if (this.renderConfig.drawArrows) {
            this.renderArrows(commandEncoder, Renderer.contextF, this.arrowFBindGroups);
        }
        this.rendererToTexture.renderDust(commandEncoder);
        textureToScreen(Renderer.contextDust, commandEncoder, this.renderPipeline, this.renderBindGroup);
        this.rendererToTexture.renderBorder(commandEncoder);
        textureToScreen(Renderer.contextBorder, commandEncoder, this.renderPipeline, this.renderBindGroup);
        this.rendererToTexture.renderSDF(commandEncoder);
        textureToScreen(Renderer.contextSDF, commandEncoder, this.renderPipeline, this.renderBindGroup);
    }
}
