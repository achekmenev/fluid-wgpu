@group(0) @binding(0)
var<storage, read_write> u: array<f32>;
@group(0) @binding(1)
var<storage, read_write> v: array<f32>;
@group(0) @binding(2)
var<storage> fu: array<f32>;
@group(0) @binding(3)
var<storage> fv: array<f32>;
@group(0) @binding(4)
var<storage> b: array<u32>;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;

// Make uniform?
//override dtOverRho: f32;
override dt: f32;
// time step over fluid density

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

fn cellIndex(x: u32, y: u32) -> u32 {
  return y * numX + x;
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  let i = cellIndex(x, y);
  if (b[i] == CellType_Fluid) {
    // Apply forces only to internal velocity components. S.t. have two adjacent fluid cells.
    if (b[cellIndex(x - 1, y)] == CellType_Fluid) {
      u[i] += dt * fu[i];
    }
    if (b[cellIndex(x, y - 1)] == CellType_Fluid) {
      v[i] += dt * fv[i];
    }
  }
}