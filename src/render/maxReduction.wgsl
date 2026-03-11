// reduction.wgsl
// This shader reads an input buffer, divides it into chunks of up to 256 elements,
// and for each chunk writes the maximum into an output buffer.

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

var<workgroup> sharedMem: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>,
  @builtin(local_invocation_id) local_id : vec3<u32>,
  @builtin(workgroup_id) wg_id : vec3<u32>
) {

  let index = global_id.x;
  // Each thread loads one element into shared memory (or a sentinel if out of bounds)
  if index < arrayLength(&input) {
    sharedMem[local_id.x] = input[index];
  } else {
    sharedMem[local_id.x] = -1.0e10;   // sufficiently small value
  }
  workgroupBarrier();

  // Tree reduction inside the workgroup
  var stride = 128u; // half of workgroupSize
  while stride > 0u {
    if local_id.x < stride {
      let other = sharedMem[local_id.x + stride];
      sharedMem[local_id.x] = max(sharedMem[local_id.x], other);
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  // Thread 0 writes the workgroup’s maximum to the output buffer
  if local_id.x == 0u {
    output[wg_id.x] = sharedMem[0];
  }
}