import { config } from './config.js'
import { initWebGPU } from './util/utilGPU.js';
import { SimulationConfig } from './core/fluid.js'
import { Simulation } from './core/simulation.js';
import * as ic from './core/initialConditions.js';
import { Renderer } from './render/Renderer.js';
import { loadConfig, loadFromFolder, loadSimulationConfig } from './load/loader.js';

async function main() {
  const [device, canvasTextureFormat] = await initWebGPU();

  /*const simCfg: SimulationConfig = {
    numX: config.numX,
    numY: config.numY,
    dx: config.dx,
    dt: config.dt,

    workgroupSizeX: config.workgroupSizeX,
    workgroupSizeY: config.workgroupSizeY,

    integrationMethod: config.numIntegrationMethod,

    clampBacktrace: true,

    poissonIterations: config.iterations,
    poissonRelaxationFactor: config.relaxationFactor,

    kinematicViscosity: config.kinematicViscosity,
    diffusionIterations: config.diffusionIterations,
    diffusionRelaxationFactor: config.diffusionRelaxationFactor,

    dustExponentialDecayConstant: config.dustExponentialDecayConstant
  }*/

  const path = './assets/TeslaSmall2/';
  const configAll = await loadConfig(path + 'config.yaml');
  const simCfg = configAll.simulationConfig;
  const renderCfg = configAll.renderConfig;
  console.log('Simulation config:', simCfg);
  console.log('Render config:', renderCfg);
  //const simCfg = await loadSimulationConfig(path + 'simulationConfig.yaml');
  const initialConditions = await loadFromFolder(path);
  //const initialConditions = ic.blowInTank();
  //const initialConditions = ic.flowOverBackwardFacingStepNoSlip();
  //const initialConditions = ic.flowOverBackwardFacingStepFreeSlip();
  //const initialConditions = ic.twoFlows();
  //const initialConditions = ic.twoCounterFlows();
  //const initialConditions = ic.flowPastObstacleFreeSlip();
  //const initialConditions = ic.flowPastObstacleNoSlip();
  //const initialConditions = ic.uniformFlow();
  const simulation = await Simulation.create(device, simCfg, initialConditions);
  
  const renderer = await Renderer.create(device, canvasTextureFormat, renderCfg, simulation.fluid);

  let frameNr = 0;
  function update() {
    if (!config.pause) {
      const commandEncoder = device.createCommandEncoder();

      simulation.step(commandEncoder);

      renderer.renderAll(commandEncoder);

      // Submit commands
      const commandBuffer = commandEncoder.finish();
      device.queue.submit([commandBuffer]);
    }

    if (config.updateIntervalMs == 0) {
      requestAnimationFrame(update);
    }
    ++frameNr;
    //console.log(`${frameNr} iteration`);
    //console.log(`fluid.pingPongIndexVel: ${fluid.pingPongIndexVel}`)
  }

  if (config.updateIntervalMs == 0) {
    update();
  }
  else {
    setInterval(update, config.updateIntervalMs);
  }
}

// Execute and handle errors
main().catch(error => {
  alert(error.message);
});