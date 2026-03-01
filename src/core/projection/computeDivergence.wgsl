@group(0) @binding(0) var<storage, read> u: array<f32>;
@group(0) @binding(1) var<storage, read> v: array<f32>;
@group(0) @binding(2) var<storage, read_write> divMulipliedByHH: array<f32>;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;
override h: f32;

fn cellIndex(x: u32, y: u32) -> u32 {
  return y * numX + x;
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
    // Actually divMulipliedByHH should be computed for fluid cells only.
    // But it'll no harm to compute some values for other cells -- they'll just not be used.
    if (x >= numX - 1 || y >= numY - 1) {
        return;
    }

    let i = cellIndex(x, y);
    let du = u[cellIndex(x + 1, y)] - u[i];
    let dv = v[cellIndex(x, y + 1)] - v[i];

    divMulipliedByHH[i] = h * (du + dv);
}