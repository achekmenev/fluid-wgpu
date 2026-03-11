import { CellType } from '../core/fluid.js';
import { allocateIC } from '../core/initialConditions.js';
//import * as yaml from 'js-yaml';
//import yaml from '../lib/js-yaml.min.js';
//import yaml from 'https://esm.sh/js-yaml';
import yaml from '../lib/js-yaml.mjs';
// https://www.webdevtutor.net/blog/typescript-yaml-load
export async function loadSimulationConfig(path) {
    let simCfg;
    //try {
    const response = await fetch(path);
    const yamlText = await response.text();
    simCfg = yaml.load(yamlText);
    //} catch (error) {
    //  console.error('Failed to load simulation config:', error);
    //}
    return simCfg;
}
export async function loadLoadConfig(path) {
    //let simCfg: SimulationConfig;
    //try {
    const response = await fetch(path);
    const yamlText = await response.text();
    const loadCfg = yaml.load(yamlText);
    //} catch (error) {
    //  console.error('Failed to load simulation config:', error);
    //}
    return loadCfg;
}
export async function loadConfig(path) {
    //let simCfg: SimulationConfig;
    //try {
    const response = await fetch(path);
    const yamlText = await response.text();
    const config = yaml.load(yamlText);
    //} catch (error) {
    //  console.error('Failed to load simulation config:', error);
    //}
    return config;
}
// https://webgpufundamentals.org/webgpu/lessons/webgpu-importing-textures.html
// 2DO: change to createImageBitmap for better performance, but it is not supported in workers, so we need to load the image in the main thread and then transfer it to the worker
async function loadPNG(path) {
    const response = await fetch(path);
    const blob = await response.blob();
    const img = new Image();
    const objectURL = URL.createObjectURL(blob);
    img.src = objectURL;
    await new Promise((resolve) => {
        img.onload = () => {
            URL.revokeObjectURL(objectURL);
            resolve();
        };
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    // Canvas is not added to DOM, so it will be garbage collected
    return imageData;
}
export async function loadFromFolder(path) {
    //const loadCfg = await loadLoadConfig(path + 'loadConfig.yaml');
    const configAll = await loadConfig(path + 'config.yaml');
    const loadCfg = configAll.loadConfig;
    console.log('Load config:', loadCfg);
    const solidImageData = await loadPNG(path + 'solid.png');
    const solidData = solidImageData.data; // Uint8ClampedArray
    const inflowImageData = await loadPNG(path + 'inflow.png');
    const inflowData = inflowImageData.data; // Uint8ClampedArray
    const outflowImageData = await loadPNG(path + 'outflow.png');
    const outflowData = outflowImageData.data; // Uint8ClampedArray
    const massImageData = await loadPNG(path + 'mass.png');
    const massData = massImageData.data; // Uint8ClampedArray
    let ic = allocateIC(solidImageData.width, solidImageData.height);
    // Fill wiht Fluid
    ic.b.fill(CellType.Fluid);
    // Inflow
    const maxInflow = loadCfg.maxInflow / 255;
    for (let y = 0; y < ic.numY; ++y) {
        for (let x = 0; x < ic.numX; ++x) {
            const pixelIndex = (ic.numY - 1 - y) * ic.numX + x;
            const cellIndex = y * ic.numX + x;
            const r = inflowData[4 * pixelIndex + 0];
            const g = inflowData[4 * pixelIndex + 1];
            const b = inflowData[4 * pixelIndex + 2];
            const a = inflowData[4 * pixelIndex + 3];
            const i = cellIndex;
            if (a >= 128 && ic.b[i] == CellType.Fluid) {
                let inflow = g >= r ? g : -r;
                inflow *= maxInflow; // Normalize to [-1, 1]
                ic.b[i] = CellType.Inflow;
                ic.e[i] = inflow;
                //ic.m[i] = ic.e[i];
            }
        }
    }
    // Outflow
    for (let y = 0; y < ic.numY; ++y) {
        for (let x = 0; x < ic.numX; ++x) {
            const pixelIndex = (ic.numY - 1 - y) * ic.numX + x;
            const cellIndex = y * ic.numX + x;
            const r = inflowData[4 * pixelIndex + 0];
            const g = inflowData[4 * pixelIndex + 1];
            const b = inflowData[4 * pixelIndex + 2];
            const a = outflowData[4 * pixelIndex + 3];
            const i = cellIndex;
            if (a >= 128 && ic.b[i] == CellType.Fluid) {
                //const outflowType = r >= g ? CellType.OutflowMembrane : CellType.Outflow;
                //ic.b[i] = outflowType;;
                ic.b[i] = CellType.Outflow;
                //ic.b[i] = CellType.OutflowMembrane;
            }
        }
    }
    // Solid
    // Analyze pixel by pixel
    for (let y = 0; y < ic.numY; ++y) {
        for (let x = 0; x < ic.numX; ++x) {
            const pixelIndex = (ic.numY - 1 - y) * ic.numX + x;
            const cellIndex = y * ic.numX + x;
            const a = solidData[4 * pixelIndex + 3];
            const i = cellIndex;
            if (a >= 128 && ic.b[i] == CellType.Fluid) {
                ic.b[i] = CellType.SolidFreeSlip;
            }
        }
    }
    // Dust density
    const maxMass = loadCfg.maxMass / 255;
    // Analyze pixel by pixel
    for (let y = 0; y < ic.numY; ++y) {
        for (let x = 0; x < ic.numX; ++x) {
            const pixelIndex = (ic.numY - 1 - y) * ic.numX + x;
            const cellIndex = y * ic.numX + x;
            const a = massData[4 * pixelIndex + 3];
            const i = cellIndex;
            if (ic.b[i] == CellType.Fluid || (ic.b[i] == CellType.Inflow /*&& ic.e[i] >= 0.0*/)) {
                ic.m[i] = a * maxMass;
            }
        }
    }
    return ic;
}
