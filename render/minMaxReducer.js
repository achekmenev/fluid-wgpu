// Requires @webgpu/types
// Input buffer must have GPUBufferUsage.STORAGE
// For single‑element case, COPY_SRC is also required.
export class MinMaxReducer {
    device;
    inputBuffer;
    //private elementCount: number;
    workgroupSize = 256;
    pipeline;
    bindGroupLayout;
    // Multi‑level reduction data
    levelSizes = []; // input size (elements) for each level
    // 2DO: make getter of last buffer?
    intermediateBuffers = []; // each holds vec2<f32> (min,max) per workgroup
    bindGroups = [];
    // Staging ring for final result
    //private stagingBuffers: GPUBuffer[] = [];
    //private currentStagingIndex = 0;
    constructor(device, inputBuffer, elementCount) {
        this.device = device;
        this.inputBuffer = inputBuffer;
        //this.elementCount = elementCount;
        if (!(inputBuffer.usage & GPUBufferUsage.STORAGE)) {
            throw new Error('Input buffer must have STORAGE usage.');
        }
        // Pre‑compute level sizes (number of elements at each stage)
        this.levelSizes.push(elementCount);
        while (this.levelSizes[this.levelSizes.length - 1] > 1) {
            const prev = this.levelSizes[this.levelSizes.length - 1];
            this.levelSizes.push(Math.ceil(prev / this.workgroupSize));
        }
        // levelSizes now: [original, after pass1, after pass2, ..., 1]
        this.setupPipeline();
        this.createIntermediateBuffers();
        this.createBindGroups();
        //this.createStagingBuffers(2); // double‑buffered staging
    }
    setupPipeline() {
        // WGSL shader that computes min and max simultaneously
        const shaderCode = /* wgsl */ `
      struct Pair {
        min : f32,
        max : f32,
      }

      @group(0) @binding(0) var<storage, read>   input  : array<f32>;
      @group(0) @binding(1) var<storage, read_write> output : array<Pair>;

      var<workgroup> shared_data : array<Pair, 256>;

      @compute @workgroup_size(256)
      fn main(
        @builtin(global_invocation_id) global_id : vec3<u32>,
        @builtin(local_invocation_id) local_id : vec3<u32>,
        @builtin(workgroup_id) wg_id : vec3<u32>
      ) {

        let index = global_id.x;
        // Initialize with extreme values
        if index < arrayLength(&input) {
          let val = input[index];
          shared_data[local_id.x] = Pair(val, val);
        } else {
          // For missing threads: min = +inf (very large), max = -inf (very small)
          shared_data[local_id.x] = Pair(1e30, -1e30);
        }
        workgroupBarrier();

        var stride = 128u;
        while stride > 0u {
          if local_id.x < stride {
            let a = shared_data[local_id.x];
            let b = shared_data[local_id.x + stride];
            shared_data[local_id.x] = Pair(
              min(a.min, b.min),
              max(a.max, b.max)
            );
          }
          workgroupBarrier();
          stride = stride >> 1u;
        }

        if local_id.x == 0u {
          output[wg_id.x] = shared_data[0];
        }
      }
    `;
        const shaderModule = this.device.createShaderModule({ code: shaderCode });
        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
            ]
        });
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout]
        });
        this.pipeline = this.device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'main' }
        });
    }
    createIntermediateBuffers() {
        // For each level (except the last, which is size 1), create a buffer holding pairs.
        for (let i = 0; i < this.levelSizes.length - 1; i++) {
            const outCount = this.levelSizes[i + 1]; // number of workgroups (each writes one pair)
            const buffer = this.device.createBuffer({
                size: outCount * 8, // two f32s = 8 bytes
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            this.intermediateBuffers.push(buffer);
        }
    }
    createBindGroups() {
        for (let i = 0; i < this.levelSizes.length - 1; i++) {
            const input = i === 0 ? this.inputBuffer : this.intermediateBuffers[i - 1];
            const output = this.intermediateBuffers[i];
            const bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: input } },
                    { binding: 1, resource: { buffer: output } }
                ]
            });
            this.bindGroups.push(bindGroup);
        }
    }
    /*private createStagingBuffers(count: number): void {
        for (let i = 0; i < count; i++) {
            const staging = this.device.createBuffer({
                size: 8, // one pair
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.stagingBuffers.push(staging);
        }
    }*/
    /**
     * Computes the minimum and maximum values of the buffer's current contents.
     * @returns Promise resolving to { min, max }.
     */
    //computeMinMax(): { min: number; max: number } {
    // Resoult is in the last intermediate buffer
    computeMinMax(commandEncoder) {
        // Single‑element case: copy directly to staging
        /*if (this.elementCount === 1) {
            if (!(this.inputBuffer.usage & GPUBufferUsage.COPY_SRC)) {
                throw new Error('Single‑element buffer requires COPY_SRC usage.');
            }
            const encoder = this.device.createCommandEncoder();
            const staging = this.stagingBuffers[this.currentStagingIndex];
            encoder.copyBufferToBuffer(this.inputBuffer, 0, staging, 0, 4); // copy one f32
            this.device.queue.submit([encoder.finish()]);
    
            await staging.mapAsync(GPUMapMode.READ);
            const val = new Float32Array(staging.getMappedRange())[0];
            staging.unmap();
    
            this.currentStagingIndex = (this.currentStagingIndex + 1) % this.stagingBuffers.length;
            return { min: val, max: val };
        }*/
        //const commandEncoder = this.device.createCommandEncoder();
        // Dispatch all reduction passes
        for (let i = 0; i < this.bindGroups.length; i++) {
            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bindGroups[i]);
            const inputSize = this.levelSizes[i];
            const workgroupCount = Math.ceil(inputSize / this.workgroupSize);
            pass.dispatchWorkgroups(workgroupCount, 1, 1);
            pass.end();
        }
        // Copy final pair (last intermediate buffer) to staging
        const finalBuffer = this.intermediateBuffers[this.intermediateBuffers.length - 1];
        /*const staging = this.stagingBuffers[this.currentStagingIndex];
        commandEncoder.copyBufferToBuffer(finalBuffer, 0, staging, 0, 8);
    
        this.device.queue.submit([commandEncoder.finish()]);
    
        // Read back the two f32 values
        await staging.mapAsync(GPUMapMode.READ);
        const resultArray = new Float32Array(staging.getMappedRange()); // length 2
        const min = resultArray[0];
        const max = resultArray[1];
        staging.unmap();
    
        this.currentStagingIndex = (this.currentStagingIndex + 1) % this.stagingBuffers.length;
    */
        //return { min, max };
    }
    /**
     * Frees all allocated GPU resources.
     */
    destroy() {
        this.intermediateBuffers.forEach(b => b.destroy());
        //this.stagingBuffers.forEach(b => b.destroy());
    }
}
