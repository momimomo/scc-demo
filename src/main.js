import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer();

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.z = 30;
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(5, 5, 5);
controls.autoRotate = true

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(0, 1, 1);
scene.add(directionalLight);

const POINT_COUNT = 60;
const SPACE_RANGE = 10; 
const dodecahedronMaterial = new THREE.MeshStandardMaterial({ color: 0x2255ff, flatShading: true });
function generateRandomPoint() {
  return new THREE.Vector3(
    (Math.random() - 0.5) * 2 * SPACE_RANGE,
    (Math.random() - 0.5) * 2 * SPACE_RANGE,
    (Math.random() - 0.5) * 2 * SPACE_RANGE
  );
}

const points = [];

for (let i = 0; i < POINT_COUNT; i++) {
  const point = generateRandomPoint();
  const geometry = new THREE.DodecahedronGeometry(0.5); 
  const mesh = new THREE.Mesh(geometry, dodecahedronMaterial);
  mesh.position.copy(point);
  scene.add(mesh);
  points.push(point);
}

const connections = []; 
for (let i = 0; i < points.length; i++) {
  for (let j = 0; j < points.length; j++) {
    if (i !== j && Math.random() < 0.02) { 
      connections.push([i, j]);
    }
  }
}
const tempObject = new THREE.Object3D();
const tempStart = new THREE.Vector3();
const tempEnd = new THREE.Vector3();

function alignObject(object, start, end, offset = 0, isCone = false, noMid = false) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  
  if (noMid) {
    const midpoint = new THREE.Vector3().addVectors(start, start).multiplyScalar(0.5).add(direction.normalize().multiplyScalar(offset));
    object.position.copy(midpoint);

  } else {
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5).add(direction.normalize().multiplyScalar(offset));
    object.position.copy(midpoint);
  }

  object.lookAt(end);
  const scaleLength = isCone ? length * 0.25 : length; 
  object.scale.set(1, scaleLength, 1);

    object.rotateX(Math.PI / 2);
}

const cylinderGeometry = new THREE.CylinderBufferGeometry(0.05, 0.05, 1, 8); 
const coneGeometry = new THREE.ConeBufferGeometry(0.2, 0.2, 8);
const cylinderMaterial = new THREE.MeshStandardMaterial();

const colorParsChunk = [
  'attribute vec3 instanceColor;',
  'varying vec3 vInstanceColor;',
  '#include <common>'
].join('\n');

const instanceColorChunk = [
  '#include <begin_vertex>',
  '\tvInstanceColor = instanceColor;'
].join('\n');

const fragmentParsChunk = [
  'varying vec3 vInstanceColor;',
  '#include <common>'
].join('\n');

const colorChunk = [
  'vec4 diffuseColor = vec4( diffuse * vInstanceColor, opacity );'
].join('\n');

cylinderMaterial.onBeforeCompile = function (shader) {
  shader.vertexShader = shader.vertexShader
      .replace('#include <common>', colorParsChunk)
      .replace('#include <begin_vertex>', instanceColorChunk);

  shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', fragmentParsChunk)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', colorChunk);
};

const instanceColors = new Float32Array(connections.length * 3);
for (let i = 0; i < connections.length; i++) {
    instanceColors.set([0.2, 0.8, 1.0], i * 3);
}
const colorAttribute = new THREE.InstancedBufferAttribute(instanceColors, 3);
const coneMaterial = new THREE.MeshStandardMaterial({color: 0xff8855, transparent: true, opacity: 1});
const cylinderInstances = new THREE.InstancedMesh(cylinderGeometry, cylinderMaterial, connections.length);
cylinderInstances.instanceMatrix.setUsage( THREE.DynamicDrawUsage );

cylinderInstances.geometry.setAttribute('instanceColor', colorAttribute);
const coneInstances = new THREE.InstancedMesh(coneGeometry, coneMaterial, connections.length * 4);

connections.forEach((connection, index) => {
  tempStart.copy(points[connection[0]]);
  tempEnd.copy(points[connection[1]]);
  alignObject(tempObject, tempStart, tempEnd);
  tempObject.updateMatrix();
  cylinderInstances.setMatrixAt(index, tempObject.matrix);
  alignObject(tempObject, tempStart, tempEnd, true);
  tempObject.updateMatrix();
  coneInstances.setMatrixAt(index, tempObject.matrix);
});

scene.add(cylinderInstances, coneInstances);
cylinderInstances.instanceMatrix.needsUpdate = true;
coneInstances.instanceMatrix.needsUpdate = true;
const adjacencyList = new Map();

connections.forEach(([from, to]) => {
  if (!adjacencyList.has(from)) adjacencyList.set(from, []);
  adjacencyList.get(from).push(to);
});

function dfs(node, graph, visited, result = []) {
  visited.add(node);
  const neighbors = graph.get(node) || [];
  neighbors.forEach(neighbor => {
    if (!visited.has(neighbor)) {
      dfs(neighbor, graph, visited, result);
    }
  });
  result.push(node);
}

function reverseGraph(adjList) {
  const reversed = new Map();
  adjList.forEach((targets, source) => {
    targets.forEach(target => {
      if (!reversed.has(target)) {
        reversed.set(target, []);
      }
      reversed.get(target).push(source);
    });
  });
  return reversed;
}

const finishingStack = [];
const visitedFirstPass = new Set();
points.forEach((_, index) => {
  if (!visitedFirstPass.has(index)) {
    dfs(index, adjacencyList, visitedFirstPass, finishingStack);
  }
});

const reversedAdjacencyList = reverseGraph(adjacencyList);

let sccs = [];
const visitedSecondPass = new Set();
while (finishingStack.length) {
  const node = finishingStack.pop(); 
  if (!visitedSecondPass.has(node)) {
    const component = [];
    dfs(node, reversedAdjacencyList, visitedSecondPass, component);
    sccs.push(component.reverse()); 
  }
}

sccs = sccs.filter(i => i.length > 1)



console.log({sccs, points, connections})

sccs.forEach((scc, index) => {
  const button = document.createElement('button');
  button.innerText = `Highlight SCC ${index + 1}`;
  button.addEventListener('click', () => highlightSCC(index));
  const buttonContainer = document.querySelector('#button-container') 
  buttonContainer.appendChild(button);
});

const sccConnections = sccs.map(scc => {
  return connections.filter(([from, to]) => scc.includes(from) && scc.includes(to));
});

const highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x999900 });
let highlightedSCCIndex = null;

if (!cylinderInstances.geometry.attributes.instanceColor) {
  const colors = new Float32Array(connections.length * 3);
  const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3);
  cylinderInstances.geometry.setAttribute('instanceColor', colorAttribute);
}

function highlightSCC(sccIndex) {
  console.log({sccIndex, sccs})
  const highlightColor = new THREE.Color(0xff0000); 
  for (let i = 0; i < connections.length; i++) {
      const currentConnection = connections[i];
      const currentSCC = sccs[sccIndex];
      let isMatching = true
      for (let i=0; i < currentConnection.length; i++) {
        console.log({currentSCC, currentConnectionI: currentConnection[i]})
        if (currentSCC.includes(currentConnection[i])) {
          console.log('Currently selected SCC contains the node')
        } else {
          isMatching = false;
        }
      }
      console.log({currentConnection, currentSCC, isMatching})
      const color = isMatching ? highlightColor : new THREE.Color(0x008888);
      updateInstanceColor(i, color);
  }
}

function updateInstanceColor(index, color) {
  const attr = cylinderInstances.geometry.attributes.instanceColor;
  attr.setXYZ(index, color.r, color.g, color.b);
  attr.needsUpdate = true;
}



const CONE_COUNT = 4;
let animationOffset = 0;
let lastTime = performance.now(); 
function setColorWithOpacity(instanceIndex, positionAlongCylinder, length) {
  const color = new THREE.Color(0xff8855); 
  let opacity;
  const bufferLength = length * 0.25; 

  if (positionAlongCylinder < bufferLength) {
    opacity = positionAlongCylinder / bufferLength; // Fade in
  } else if (positionAlongCylinder > length - bufferLength) {
    opacity = (length - positionAlongCylinder) / bufferLength; // Fade out
  } else {
    opacity = 1;
  }

  color.lerp(new THREE.Color(0x000000), 1 - opacity);
  coneInstances.setColorAt(instanceIndex, color);
  
  coneInstances.instanceColor.needsUpdate = true;
}


function animateCones() {

  connections.forEach((connection, index) => {
    tempStart.copy(points[connection[0]]);
    tempEnd.copy(points[connection[1]]);
    const length = tempEnd.distanceTo(tempStart);

    for (let i = 0; i < CONE_COUNT; i++) {
      let positionAlongCylinder = (animationOffset + (length / CONE_COUNT) * i) % length;
      alignObject(tempObject, tempStart, tempEnd, positionAlongCylinder, true, true);
      tempObject.updateMatrix();
      coneInstances.setMatrixAt(index * CONE_COUNT + i, tempObject.matrix);
      setColorWithOpacity(index * CONE_COUNT + i, positionAlongCylinder, length);
    }
  });

  coneInstances.instanceMatrix.needsUpdate = true;
  coneInstances.instanceColor.needsUpdate = true;
}


function animate(time) {
  requestAnimationFrame(animate);

  let deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  animationOffset += deltaTime;
  const maxAnimationOffset = SPACE_RANGE * 2;
  if (animationOffset > maxAnimationOffset) {
    animationOffset -= maxAnimationOffset;
  }
  
  animateCones();

  renderer.render(scene, camera);
}
animate(0);

