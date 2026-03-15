struct HorizontalLine {
  y: f32,
  leftX: f32,
  rightX: f32
}

struct VerticalLine {
  x: f32,
  bottomY: f32,
  topY: f32
}

@group(0) @binding(0) var<storage, read_write> sdf: array<f32>;
@group(0) @binding(1) var<storage, read> horLines: array<HorizontalLine>;
@group(0) @binding(2) var<storage, read> verLines: array<VerticalLine>;
@group(0) @binding(3) var<storage, read> cellTypes: array<u32>;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
// There are other cell types but here I need just fluid.

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;

fn cellIndex(x: u32, y: u32) -> u32 {
  return y * numX + x;
}

fn distSqrPointToHorizontalLine(x: f32, y: f32, horLine: HorizontalLine) -> f32 {
  let dy = horLine.y - y;

  var dx = 0.0;
  if (x < horLine.leftX) {
    dx = horLine.leftX - x;
  }
  else if (x > horLine.rightX) {
    dx = horLine.rightX - x;
  }

  return dx * dx + dy * dy;
}

fn distSqrPointToVerticalLine(x: f32, y: f32, verLine: VerticalLine) -> f32 {
  let dx = verLine.x - x;

  var dy = 0.0;
  if (y < verLine.bottomY) {
    dy = verLine.bottomY - y;
  }
  else if (y > verLine.topY) {
    dy = verLine.topY - y;
  }

  return dx * dx + dy * dy;
}

fn minDist(x: f32, y: f32) -> f32 {
  const INFINITY = 1e30;
  var minDistSqr = INFINITY;

  for (var i = 0u; i < arrayLength(&horLines); i++) {
    let horLine = horLines[i];
    let distSqr = distSqrPointToHorizontalLine(x, y, horLine);
    if (distSqr < minDistSqr) {
      minDistSqr = distSqr;
    }
  }

  for (var i = 0u; i < arrayLength(&verLines); i++) {
    let verLine = verLines[i];
    let distSqr = distSqrPointToVerticalLine(x, y, verLine);
    if (distSqr < minDistSqr) {
      minDistSqr = distSqr;
    }
  }

  return sqrt(minDistSqr);
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let x = f32(id.x) + 0.5;
  let y = f32(id.y) + 0.5;

  var dist = minDist(x, y);
  let i = cellIndex(id.x, id.y);
  if (cellTypes[i] != CellType_Fluid) {
    dist = -dist;
  }

  sdf[i] = dist;
}