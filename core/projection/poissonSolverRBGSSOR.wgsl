@group(0) @binding(0) var<storage, read_write> p: array<f32>;
@group(0) @binding(1) var<storage, read> divMulipliedByHH: array<f32>;
@group(0) @binding(2) var<storage, read> b: array<u32>;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;
override relaxationFactor: f32;

fn cellIndex(x: u32, y: u32) -> u32 {
  return y * numX + x;
}

const RED = 0u;
const BLACK = 1u;

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn redPass(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  let i = cellIndex(x, y);
  if ((x + y) % 2 != RED || b[i] != CellType_Fluid) {
    return;
  }

  let oldP = p[i];
  // There'd be no index OOB if there is no fluid on the border rect.
  let newP = 0.25 * (
    p[cellIndex(x + 1, y)] +
    p[cellIndex(x - 1, y)] +
    p[cellIndex(x, y + 1)] +
    p[cellIndex(x, y - 1)] -
    divMulipliedByHH[i] // Remember about h^2 by which the equation was multiplied.
  );
  // relaxationFactor = 1.0 corresponds to pure Gauss-Seidel.
  p[i] = relaxationFactor * newP + (1.0 - relaxationFactor) * oldP;
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn blackPass(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  let i = cellIndex(x, y);
  if ((x + y) % 2 != BLACK || b[i] != CellType_Fluid) {
    return;
  }

  let oldP = p[i];
  // There'd be no index OOB if there is no fluid on the border rect.
  let newP = 0.25 * (
    p[cellIndex(x + 1, y)] +
    p[cellIndex(x - 1, y)] +
    p[cellIndex(x, y + 1)] +
    p[cellIndex(x, y - 1)] -
    divMulipliedByHH[i] // Remember about h^2 by which the equation was multiplied.
  );
  // relaxationFactor = 1.0 corresponds to pure Gauss-Seidel.
  p[i] = relaxationFactor * newP + (1.0 - relaxationFactor) * oldP;
}