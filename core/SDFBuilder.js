import { createBindGroup, executeComputePass, PipelineBuilder } from '../util/utilGPU.js';
import { CellType } from './fluid.js';
export class SDFBuilder {
    cellTypeArray;
    numX;
    numY;
    //sdf: Float32Array;
    constructor(cellTypeArray, numX, numY) {
        this.cellTypeArray = cellTypeArray;
        this.numX = numX;
        this.numY = numY;
        //this.sdf = this.buildSDF();
    }
    buildSDF() {
        return this.buildSDFByLines();
    }
    async buildSDFGPU(device, b, sdf, workgroupSizeX = 8, workgroupSizeY = 8) {
        // Build boundary lines
        const horLineArray = this.getHorizontalLines();
        const verLineArray = this.getVerticalLines();
        // Make flat arrays
        const floatsPerLine = 3;
        const horLineData = new Float32Array(horLineArray.length * floatsPerLine);
        horLineArray.forEach((horLine, index) => {
            horLineData[index * floatsPerLine + 0] = horLine.y;
            horLineData[index * floatsPerLine + 1] = horLine.leftX;
            horLineData[index * floatsPerLine + 2] = horLine.rightX;
        });
        const verLineData = new Float32Array(verLineArray.length * floatsPerLine);
        verLineArray.forEach((verLine, index) => {
            verLineData[index * floatsPerLine + 0] = verLine.x;
            verLineData[index * floatsPerLine + 1] = verLine.bottomY;
            verLineData[index * floatsPerLine + 2] = verLine.topY;
        });
        // Create GPU buffers
        const numCells = this.numX * this.numY;
        const floatSizeBytes = 4;
        const horLineBuffer = device.createBuffer({
            label: 'Horizontal lines',
            size: horLineData.length * floatSizeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const verLineBuffer = device.createBuffer({
            label: 'Vertical lines',
            size: verLineData.length * floatSizeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const queue = device.queue;
        queue.writeBuffer(horLineBuffer, 0, horLineData.buffer);
        queue.writeBuffer(verLineBuffer, 0, verLineData.buffer);
        // 
        const computePipeline = await PipelineBuilder.createComputePipeline(device, './core/SDFBuilder.wgsl', {
            workgroupSizeX: workgroupSizeX,
            workgroupSizeY: workgroupSizeY,
            numX: this.numX,
            numY: this.numY,
        }, 'SDF builder');
        const bindGroup = createBindGroup(device, computePipeline, [sdf, horLineBuffer, verLineBuffer, b], `SDF builder`);
        //
        const commandEncoder = device.createCommandEncoder();
        const workgroupCountX = Math.ceil(this.numX / workgroupSizeX);
        const workgroupCountY = Math.ceil(this.numY / workgroupSizeY);
        executeComputePass(commandEncoder, computePipeline, bindGroup, workgroupCountX, workgroupCountY);
        const commandBuffer = commandEncoder.finish();
        device.queue.submit([commandBuffer]);
        // Clean GPU buffers
        horLineBuffer.destroy();
        verLineBuffer.destroy();
    }
    // Exact SDF by lines. Good for straight borders.
    // Assumes that there is at least 1 cell width boundary at the border.
    buildSDFByLines() {
        const numCells = this.numX * this.numY;
        const sdf = new Float32Array(numCells);
        const horLineArray = this.getHorizontalLines();
        const verLineArray = this.getVerticalLines();
        for (let idx = 0, j = 0; j < this.numY; ++j) {
            for (let i = 0; i < this.numX; ++i, ++idx) {
                const x = i + 0.5;
                const y = j + 0.5;
                let minDistSqr = Number.MAX_VALUE;
                for (const horLine of horLineArray) {
                    const distSqr = distSqrPointToHorizontalLine(x, y, horLine);
                    if (distSqr < minDistSqr) {
                        minDistSqr = distSqr;
                    }
                }
                for (const verLine of verLineArray) {
                    const distSqr = distSqrPointToVerticalLine(x, y, verLine);
                    if (distSqr < minDistSqr) {
                        minDistSqr = distSqr;
                    }
                }
                let dist = Math.sqrt(minDistSqr);
                if (this.cellTypeArray[idx] != CellType.Fluid) {
                    dist = -dist;
                }
                sdf[idx] = dist;
            }
        }
        return sdf;
    }
    getHorizontalLines() {
        let horLineArray = new Array;
        let isLineStarted = false;
        let startX;
        for (let j = 1; j < this.numY; ++j) {
            for (let i = 1; i < this.numX; ++i) {
                let numFluidVer = 0;
                numFluidVer += this.oneIfFluidCell(i, j - 1);
                numFluidVer += this.oneIfFluidCell(i, j);
                const isBoundaryVer = (numFluidVer == 1);
                if (isBoundaryVer && !isLineStarted) {
                    isLineStarted = true;
                    startX = i;
                }
                else if (!isBoundaryVer && isLineStarted) {
                    isLineStarted = false;
                    const stopX = i;
                    const horLine = { y: j, leftX: startX, rightX: stopX };
                    horLineArray.push(horLine);
                }
            }
        }
        return horLineArray;
    }
    getVerticalLines() {
        let verLineArray = new Array;
        let isLineStarted = false;
        let startY;
        for (let i = 1; i < this.numX; ++i) {
            for (let j = 1; j < this.numY; ++j) {
                let numFluidHor = 0;
                numFluidHor += this.oneIfFluidCell(i - 1, j);
                numFluidHor += this.oneIfFluidCell(i, j);
                const isBoundaryHor = (numFluidHor == 1);
                if (isBoundaryHor && !isLineStarted) {
                    isLineStarted = true;
                    startY = j;
                }
                else if (!isBoundaryHor && isLineStarted) {
                    isLineStarted = false;
                    const stopY = j;
                    const verLine = { x: i, bottomY: startY, topY: stopY };
                    verLineArray.push(verLine);
                }
            }
        }
        return verLineArray;
    }
    oneIfFluidCell(i, j) {
        return this.cellTypeArray[this.cellIndex(i, j)] == CellType.Fluid ? 1 : 0;
    }
    cellIndex(i, j) {
        return j * this.numX + i;
    }
}
function distSqrPointToHorizontalLine(x, y, horLine) {
    const dy = horLine.y - y;
    let dx = 0.0;
    if (x < horLine.leftX) {
        dx = horLine.leftX - x;
    }
    else if (x > horLine.rightX) {
        dx = horLine.rightX - x;
    }
    return dx * dx + dy * dy;
}
function distSqrPointToVerticalLine(x, y, verLine) {
    const dx = verLine.x - x;
    let dy = 0.0;
    if (y < verLine.bottomY) {
        dy = verLine.bottomY - y;
    }
    else if (y > verLine.topY) {
        dy = verLine.topY - y;
    }
    return dx * dx + dy * dy;
}
