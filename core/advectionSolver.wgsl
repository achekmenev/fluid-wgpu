// All bindings for both shaders

@group(0) @binding(0)
var<storage, read> u: array<f32>;
@group(0) @binding(1)
var<storage, read> v: array<f32>;
@group(0) @binding(2)
var<storage, read_write> newU: array<f32>;
@group(0) @binding(3)
var<storage, read_write> newV: array<f32>;
@group(0) @binding(4)
var<storage, read> b: array<u32>;
@group(0) @binding(5)
var<storage, read> d: array<f32>;

@group(0) @binding(6)
var<storage, read> m: array<f32>;
@group(0) @binding(7)
var<storage, read_write> newM: array<f32>;
@group(0) @binding(8)
var<storage, read> e: array<f32>;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: i32;
override numY: i32;
//override numCells: u32;

// Make uniform?
// time step over space step
override dtOverH: f32;
override dt: f32;

override integrationMethod = IntegrationMethod_Midpoint;

alias IntegrationMethod = u32;
const IntegrationMethod_Euler: IntegrationMethod = 0;
const IntegrationMethod_Midpoint: IntegrationMethod = 1;

override isClampBacktrace = true;

fn cellIndex(x: i32, y: i32) -> i32 {
  return y * numX + x;
}

//      ^          ^
// *----|-----*----|----*
// | vi-1j+1  |  vij+1  |
// |        uij->     ui+1j->
// |    ^     |    ^    |
// *----|-----*----|----*
// |  vi-1j   |   vij   |
// |       uij-1->   ui+1j-1->
// |          |         |
// *----------*---------*
// 0 <= i <= numX, 0 <= j <= numY. Not strict equality because of the staggered grid.
// See e.g. 10minutephysics 17, p. 24.
// Average u component at v_{i,j} position on the grid.
// Bridson, Muller-Fisher. Fluid simulation. SIGGRAPH 2007 course notes. p. 17
fn avgU(i: i32, j: i32) -> f32 {
  // There'd be no index OOB if there is no fluid on the border rect.
  return 0.25 * (u[cellIndex(i, j - 1)] + u[cellIndex(i, j)] + u[cellIndex(i + 1, j - 1)] + u[cellIndex(i + 1, j)]);
}

// Average v component at u_{i,j} position on the grid.
fn avgV(i: i32, j: i32) -> f32 {
  // There'd be no index OOB if there is no fluid on the border rect.
  return 0.25 * (v[cellIndex(i - 1, j)] + v[cellIndex(i, j)] + v[cellIndex(i - 1, j + 1)] + v[cellIndex(i, j + 1)]);
}

// Bilerp
//

struct CornerIndicesAndWeights {
  x0: i32,
  y0: i32,
  x1: i32,
  y1: i32,
  wx: f32,
  wy: f32
}

fn getCornerIndicesAndWeights(pos: vec2f) -> CornerIndicesAndWeights {
  let x = pos.x;
  let y = pos.y;
  let floorX = floor(x);
  let floorY = floor(y);

  // Get fractional weights
  let wx = x - floorX;
  let wy = y - floorY;

  // Get integer coordinates
  var x0 = i32(floorX);
  var y0 = i32(floorY);
  var x1 = x0 + 1;
  var y1 = y0 + 1;
  // Apply clamping to coordinates
  x0 = clamp(x0, 0, numX - 1);
  y0 = clamp(y0, 0, numY - 1);
  x1 = clamp(x1, 0, numX - 1);
  y1 = clamp(y1, 0, numY - 1);

  return CornerIndicesAndWeights(x0, y0, x1, y1, wx, wy);
}

// Sample the four corner points
//Y
//^
//|f01 f11
//|f00 f10
//----------> X
fn bilerp(f00: f32, f10: f32, f01: f32, f11: f32, wx: f32, wy: f32) -> f32 {
  // Interpolate along x direction
  let bot = f00 * (1.0 - wx) + f10 * wx;
  let top = f01 * (1.0 - wx) + f11 * wx;

  // Interpolate along y direction
  return bot * (1.0 - wy) + top * wy;
}

fn bilerpU(pos: vec2f) -> f32 {
  let iw = getCornerIndicesAndWeights(pos);

  // Sample the four corner points
  let f00 = u[cellIndex(iw.x0, iw.y0)];
  let f10 = u[cellIndex(iw.x1, iw.y0)];
  let f01 = u[cellIndex(iw.x0, iw.y1)];
  let f11 = u[cellIndex(iw.x1, iw.y1)];

  return bilerp(f00, f10, f01, f11, iw.wx, iw.wy);
}

fn bilerpV(pos: vec2f) -> f32 {
  let iw = getCornerIndicesAndWeights(pos);

  // Sample the four corner points
  let f00 = v[cellIndex(iw.x0, iw.y0)];
  let f10 = v[cellIndex(iw.x1, iw.y0)];
  let f01 = v[cellIndex(iw.x0, iw.y1)];
  let f11 = v[cellIndex(iw.x1, iw.y1)];

  return bilerp(f00, f10, f01, f11, iw.wx, iw.wy);
}

fn bilerpD(pos: vec2f) -> f32 {
  let iw = getCornerIndicesAndWeights(pos);

  // Sample the four corner points
  let f00 = d[cellIndex(iw.x0, iw.y0)];
  let f10 = d[cellIndex(iw.x1, iw.y0)];
  let f01 = d[cellIndex(iw.x0, iw.y1)];
  let f11 = d[cellIndex(iw.x1, iw.y1)];

  return bilerp(f00, f10, f01, f11, iw.wx, iw.wy);
}

fn bilerpM(pos: vec2f) -> f32 {
  let iw = getCornerIndicesAndWeights(pos);

  // Sample the four corner points
  let f00 = m[cellIndex(iw.x0, iw.y0)];
  let f10 = m[cellIndex(iw.x1, iw.y0)];
  let f01 = m[cellIndex(iw.x0, iw.y1)];
  let f11 = m[cellIndex(iw.x1, iw.y1)];

  return bilerp(f00, f10, f01, f11, iw.wx, iw.wy);
}

//
// Bilerp

// There are three grids in staggered grid approach: u-grid, v-grid and center-grid.
// Offsets represent mutual position of advected grid and u- and v-grids.
// E.g. offsetU is the vector by which the u-grid needs to be shifted to get the advected grid.
fn getPrevPos(pos: vec2f, velAtPos: vec2f, offsetU: vec2f, offsetV: vec2f, offsetD: vec2f) -> vec2f {
  switch (integrationMethod) {
    case IntegrationMethod_Euler: {
      return pos - dtOverH * velAtPos;
    }
    case IntegrationMethod_Midpoint, default : {
      var posMid = pos - 0.5 * dtOverH * velAtPos;

      if (isClampBacktrace) {
        let distCurr = bilerpD(pos + offsetD);
        let distPrev = bilerpD(posMid + offsetD);
        posMid = clampBacktrace(pos, posMid, distCurr, distPrev);
      }

      let uMid = bilerpU(posMid + offsetU);
      let vMid = bilerpV(posMid + offsetV);
      let velMid = vec2f(uMid, vMid);

      return pos - dtOverH * velMid;
    }
  }
}

fn clampBacktrace(currPos: vec2f, prevPos: vec2f, currDist: f32, prevDist: f32) -> vec2f {
  // currDist must be > 0

  // No clamping if the whole line is inside the fluid.
  if (prevDist >= 0.0) {
    return prevPos;
  }

  // As currDist > 0 and prevDist < 0 it's equivalent to
  // const w = Math.abs(prevDist) / (Math.abs(prevDist) + Math.abs(currDist));
  let w = prevDist / (prevDist - currDist);
  let clampedPrevX = w * currPos.x + (1.0 - w) * prevPos.x;
  let clampedPrevY = w * currPos.y + (1.0 - w) * prevPos.y;

  return vec2f(clampedPrevX, clampedPrevY);
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn advectVelocity(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let y = i32(id.y);
  if (x >= numX || y >= numY) {
    return;
  }
  let i = cellIndex(x, y);

  // U
  {
    var newValue: f32;
    // Advect only internal cells. There'd be no OOB if there's no fluid at the boundary.
    if (b[i] == CellType_Fluid && b[cellIndex(x - 1, y)] == CellType_Fluid) {
      let velU = u[i];
      let velV = avgV(x, y);
      var prevPos = getPrevPos(vec2f(f32(x), f32(y)), vec2f(velU, velV), vec2f(0), vec2f(- 0.5, 0.5), vec2f(-0.5, 0.0));

      if (isClampBacktrace) {
        // Must be positive. Equivalent to
        //const distCurr = this.bilerp(x - 0.5, y, this.fluid.d);
        let distCurr = 0.5 * (d[i] + d[cellIndex(x - 1, y)]);
        let distPrev = bilerpD(vec2f(prevPos.x - 0.5, prevPos.y));
        prevPos = clampBacktrace(vec2f(f32(x), f32(y)), prevPos, distCurr, distPrev);
      }

      newValue = bilerpU(prevPos);
    }
    // Copy other cells. They contain boundary data.
    else {
      newValue = u[i];
    }

    newU[i] = newValue;
  }

  // V
  {
    var newValue: f32;
    if (b[i] == CellType_Fluid && b[cellIndex(x, y - 1)] == CellType_Fluid) {
      let velU = avgU(x, y);
      let velV = v[i];
      var prevPos = getPrevPos(vec2f(f32(x), f32(y)), vec2f(velU, velV), vec2f(0.5, - 0.5), vec2f(0), vec2f(0.0, -0.5));

      if (isClampBacktrace) {
        //const distCurr = this.bilerp(x, y - 0.5, this.fluid.d);
        let distCurr = 0.5 * (d[i] + d[cellIndex(x, y - 1)]);
        let distPrev = bilerpD(vec2f(prevPos.x, prevPos.y - 0.5));
        prevPos = clampBacktrace(vec2f(f32(x), f32(y)), prevPos, distCurr, distPrev);
      }

      newValue = bilerpV(prevPos);
    }
    else {
      newValue = v[i];
    }

    newV[i] = newValue;
  }
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn advectAndEmitDust(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let y = i32(id.y);
  if (x >= numX || y >= numY) {
    return;
  }
  let i = cellIndex(x, y);

  var dustM: f32;
  // Advect and emit for fluid cells
  if (b[i] == CellType_Fluid) {
    // There'd be no index OOB if there is no fluid on the border rect.
    let velU = 0.5 * (u[i] + u[cellIndex(x + 1, y)]);
    let velV = 0.5 * (v[i] + v[cellIndex(x, y + 1)]);

    var prevPos = getPrevPos(vec2f(f32(x), f32(y)), vec2f(velU, velV), vec2f(0.5, 0), vec2f(0, 0.5), vec2f(0.0));

    if (isClampBacktrace) {
      let distCurr = bilerpD(vec2f(f32(x), f32(y)));
      let distPrev = bilerpD(prevPos);
      prevPos = clampBacktrace(vec2f(f32(x), f32(y)), prevPos, distCurr, distPrev);
    }

    // Advection
    dustM = bilerpM(prevPos);
    // For the case if we set density at the ghost boundary cells too aggressively
    dustM = max(dustM, 0.0);
    // Emission
    dustM += dt * e[i];
  }
  // Just copy for another cells. For inflow cells it's actually important.
  else {
    dustM = m[i];
  }

  newM[i] = dustM;
}