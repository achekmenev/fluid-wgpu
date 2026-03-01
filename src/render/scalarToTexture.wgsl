// Scalar component at the cell center
@group(0) @binding(0) var<storage> f: array<f32>;
// Texture to render the data on
@group(0) @binding(1) var outputImage: texture_storage_2d<rgba8unorm, write>;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;

// https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/
// https://gist.github.com/mikhailov-work/0d177465a8151eb6ede1768d51d476c7
fn TurboColormap(x: f32) -> vec3f {
    const kRedVec4 = vec4f(0.13572138, 4.61539260, - 42.66032258, 132.13108234);
    const kGreenVec4 = vec4f(0.09140261, 2.19418839, 4.84296658, - 14.18503333);
    const kBlueVec4 = vec4f(0.10667330, 12.64194608, - 60.58204836, 110.36276771);
    const kRedVec2 = vec2f(- 152.94239396, 59.28637943);
    const kGreenVec2 = vec2f(4.27729857, 2.82956604);
    const kBlueVec2 = vec2f(- 89.90310912, 27.34824973);

    let y = clamp(x, 0.0, 1.0);
    let v4 = vec4f(1.0, y, y * y, y * y * y);
    let v2 = v4.zw * v4.z;
    return vec3f(dot(v4, kRedVec4) + dot(v2, kRedVec2), dot(v4, kGreenVec4) + dot(v2, kGreenVec2), dot(v4, kBlueVec4) + dot(v2, kBlueVec2));
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn main(@builtin(global_invocation_id) id: vec3u) {
    // Only process pixels within texture bounds
    if (id.x >= numX || id.y >= numY) {
        return;
    }

    let i = id.y * numX + id.x;
    let val = f[i];

    const negativeColor = vec3f(0, 0, 0);
    const minValue = 0.0;
    const maxValue = 1.0;

    let valNormalized = (val - minValue) / (maxValue - minValue);

    var cellColor = TurboColormap(valNormalized);

    // Write to texture
    textureStore(outputImage, id.xy, vec4f(cellColor, 1));
}