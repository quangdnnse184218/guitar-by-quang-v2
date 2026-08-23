import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

let activeLights = null

export function updateSceneLighting(isDark) {
  if (!activeLights) return
  if (isDark) {
    activeLights.hemiLight.intensity = 0.6
    activeLights.hemiLight.groundColor.setHex(0x444444)
    activeLights.dirLight.intensity = 0.8
  } else {
    // Light mode: enhance ambient and directional lighting
    activeLights.hemiLight.intensity = 0.95
    activeLights.hemiLight.groundColor.setHex(0x888899)
    activeLights.dirLight.intensity = 1.15
  }
}

export function initGuitarScene(canvasEl) {
  const container = canvasEl.parentElement

  // Create Loading UI
  const loadingDiv = document.createElement('div')
  loadingDiv.className = 'glass-card absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 px-6 py-4 z-10'
  loadingDiv.innerHTML = `
    <div class="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
    <span class="text-text-primary text-sm font-medium">Đang tải mô hình 3D...</span>
  `
  container.appendChild(loadingDiv)

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, canvasEl.clientWidth / canvasEl.clientHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true })
  renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearAlpha(0) // Transparent background

  // Lights
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
  hemiLight.position.set(0, 20, 0)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 10, 5)
  scene.add(dirLight)

  activeLights = { hemiLight, dirLight }
  
  // Set initial lighting based on current document theme
  const isCurrentlyDark = document.documentElement.getAttribute('data-theme') !== 'light'
  updateSceneLighting(isCurrentlyDark)

  let guitarModel = null
  let reqId = null

  const loader = new GLTFLoader()
  loader.load(
    '/models/acoustic-guitar.glb',
    (gltf) => {
      guitarModel = gltf.scene
      
      // Center and scale model slightly based on typical acoustic guitar glb
      const box = new THREE.Box3().setFromObject(guitarModel)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 3 / maxDim // target size approx 3 units
      guitarModel.scale.set(scale, scale, scale)
      
      // Update world matrices and recompute box after scale
      guitarModel.updateMatrixWorld(true)
      const scaledBox = new THREE.Box3().setFromObject(guitarModel)
      const center = scaledBox.getCenter(new THREE.Vector3())
      
      guitarModel.position.x -= center.x
      guitarModel.position.y -= center.y
      guitarModel.position.z -= center.z

      const wrapper = new THREE.Group()
      wrapper.add(guitarModel)
      scene.add(wrapper)
      
      guitarModel = wrapper // Reference wrapper to rotate around center

      console.log('3D model loaded successfully!')
      if (loadingDiv.parentElement) {
        loadingDiv.parentElement.removeChild(loadingDiv)
      }
    },
    undefined,
    (error) => {
      console.error('Error loading 3D model:', error)
      if (loadingDiv.parentElement) {
        loadingDiv.parentElement.removeChild(loadingDiv)
      }
      initFallbackGuitarIcon(container)
      canvasEl.style.display = 'none'
    }
  )

  const render = () => {
    renderer.render(scene, camera)
    reqId = requestAnimationFrame(render)
  }
  render()

  const onWindowResize = () => {
    camera.aspect = canvasEl.clientWidth / canvasEl.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight)
  }
  window.addEventListener('resize', onWindowResize)

  return {
    setRotationProgress: (t) => {
      if (guitarModel) {
        guitarModel.rotation.y = t * Math.PI * 1.5 // 0 to 270 degrees
      }
    },
    dispose: () => {
      cancelAnimationFrame(reqId)
      window.removeEventListener('resize', onWindowResize)
      renderer.dispose()
      scene.traverse((object) => {
        if (!object.isMesh) return
        object.geometry.dispose()
        if (object.material.isMaterial) {
          cleanMaterial(object.material)
        } else {
          for (const material of object.material) cleanMaterial(material)
        }
      })
    }
  }
}

function cleanMaterial(material) {
  material.dispose()
  if (material.map) material.map.dispose()
  if (material.lightMap) material.lightMap.dispose()
  if (material.bumpMap) material.bumpMap.dispose()
  if (material.normalMap) material.normalMap.dispose()
  if (material.specularMap) material.specularMap.dispose()
  if (material.envMap) material.envMap.dispose()
}

export function initFallbackGuitarIcon(containerEl) {
  // Create a simple SVG inline that represents a guitar
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 100 200')
  svg.setAttribute('class', 'w-full h-full max-w-[200px] max-h-[400px] opacity-70')
  
  // Custom CSS animation definition inline
  const style = document.createElement('style')
  style.innerHTML = `
    @keyframes spin-slow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .animate-spin-slow {
      animation: spin-slow 12s linear infinite;
      transform-origin: center;
    }
  `
  svg.appendChild(style)
  
  // Guitar body (oval)
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  body.setAttribute('d', 'M50,180 C10,180 10,120 30,100 C15,80 20,40 50,40 C80,40 85,80 70,100 C90,120 90,180 50,180 Z')
  body.setAttribute('fill', 'var(--accent-primary)')
  
  // Guitar neck (rectangle)
  const neck = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  neck.setAttribute('x', '42')
  neck.setAttribute('y', '10')
  neck.setAttribute('width', '16')
  neck.setAttribute('height', '50')
  neck.setAttribute('fill', 'var(--accent-secondary)')
  
  // Sound hole (circle)
  const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  hole.setAttribute('cx', '50')
  hole.setAttribute('cy', '100')
  hole.setAttribute('r', '12')
  hole.setAttribute('fill', 'var(--bg-base)')
  
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('class', 'animate-spin-slow')
  g.appendChild(neck)
  g.appendChild(body)
  g.appendChild(hole)
  
  svg.appendChild(g)
  
  // Wrapper for centering
  const wrapper = document.createElement('div')
  wrapper.className = 'w-full h-[400px] flex items-center justify-center'
  wrapper.appendChild(svg)
  
  containerEl.appendChild(wrapper)
}
