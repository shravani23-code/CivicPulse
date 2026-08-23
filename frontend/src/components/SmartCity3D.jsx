import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Citizen/issue nodes connected to a smaller set of larger "hub" nodes
// representing city zones/services — a subtle civic network visualization.
function SmartCity3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const isMobile = window.innerWidth < 768
    const NODE_COUNT = isMobile ? 22 : 62
    const HUB_COUNT = isMobile ? 4 : 8
    const CONNECT_DISTANCE = isMobile ? 3 : 4.2
    const HUB_CONNECT_DISTANCE = isMobile ? 5.5 : 7.5

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    )
    camera.position.z = 14

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const group = new THREE.Group()
    scene.add(group)

    // --- Citizen / issue nodes ---
    const positions = []
    for (let i = 0; i < NODE_COUNT; i++) {
      positions.push(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8
      )
    }

    const nodeGeometry = new THREE.BufferGeometry()
    nodeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )

    const nodeMaterial = new THREE.PointsMaterial({
      color: 0x3f7d58,
      size: 0.13,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
    })

    const points = new THREE.Points(nodeGeometry, nodeMaterial)
    group.add(points)

    // --- Hub nodes (city zones / services) — larger, lighter ---
    const hubGroup = new THREE.Group()
    const hubPositions = []
    for (let i = 0; i < HUB_COUNT; i++) {
      hubPositions.push(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 6
      )
    }

    const hubGeometry = new THREE.BufferGeometry()
    hubGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(hubPositions, 3)
    )

    const hubMaterial = new THREE.PointsMaterial({
      color: 0xdff0e4,
      size: 0.32,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    })

    const hubs = new THREE.Points(hubGeometry, hubMaterial)
    hubGroup.add(hubs)
    group.add(hubGroup)

    // --- Connections: node-to-node, computed once at init ---
    const linePositions = []
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const ix = i * 3
        const jx = j * 3
        const dx = positions[ix] - positions[jx]
        const dy = positions[ix + 1] - positions[jx + 1]
        const dz = positions[ix + 2] - positions[jx + 2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < CONNECT_DISTANCE) {
          linePositions.push(
            positions[ix], positions[ix + 1], positions[ix + 2],
            positions[jx], positions[jx + 1], positions[jx + 2]
          )
        }
      }
    }

    // --- Connections: node-to-nearest-hub, representing citizen<->service links ---
    for (let i = 0; i < NODE_COUNT; i++) {
      const ix = i * 3
      let nearestHub = -1
      let nearestDist = Infinity
      for (let h = 0; h < HUB_COUNT; h++) {
        const hx = h * 3
        const dx = positions[ix] - hubPositions[hx]
        const dy = positions[ix + 1] - hubPositions[hx + 1]
        const dz = positions[ix + 2] - hubPositions[hx + 2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestHub = h
        }
      }
      if (nearestHub >= 0 && nearestDist < HUB_CONNECT_DISTANCE) {
        const hx = nearestHub * 3
        linePositions.push(
          positions[ix], positions[ix + 1], positions[ix + 2],
          hubPositions[hx], hubPositions[hx + 1], hubPositions[hx + 2]
        )
      }
    }

    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    )

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x9fc4ab,
      transparent: true,
      opacity: 0.15,
    })

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
    group.add(lines)

    // --- Mouse parallax ---
    const mouse = { x: 0, y: 0 }
    const currentTilt = { x: 0, y: 0 }

    function handleMouseMove(event) {
      const rect = mount.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    let frameId
    let time = 0

    function animate() {
      time += 0.001

      currentTilt.x += (mouse.y * 0.06 - currentTilt.x) * 0.03
      currentTilt.y += (mouse.x * 0.08 - currentTilt.y) * 0.03

      group.rotation.x = currentTilt.x
      group.rotation.y = Math.sin(time) * 0.05 + currentTilt.y

      // gentle independent hub drift — cheap, single value per frame
      hubGroup.rotation.y = -time * 1.5
      hubMaterial.opacity = 0.7 + Math.sin(time * 2.2) * 0.15

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    function handleResize() {
      const width = mount.clientWidth
      const height = mount.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)

      nodeGeometry.dispose()
      nodeMaterial.dispose()
      hubGeometry.dispose()
      hubMaterial.dispose()
      lineGeometry.dispose()
      lineMaterial.dispose()
      renderer.dispose()

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className="civic-network-3d"
      aria-hidden="true"
    />
  )
}

export default SmartCity3D
