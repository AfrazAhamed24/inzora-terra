import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface ConstellationAgent {
  key: string;
  short: string;
  confidence: number | null;
  state: string;
  color: string;
}

const POSITIONS = [
  new THREE.Vector3(0, 2.15, 0),
  new THREE.Vector3(1.95, 0.75, 0),
  new THREE.Vector3(1.2, -1.62, 0),
  new THREE.Vector3(-1.2, -1.62, 0),
  new THREE.Vector3(-1.95, 0.75, 0),
];

interface Props {
  agents: ConstellationAgent[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

/** Interactive Three.js scene. Text controls stay in the DOM for keyboard and screen-reader access. */
export function AgentConstellation({ agents, selectedKey, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const coreLabelRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectedRef = useRef(selectedKey);
  selectedRef.current = selectedKey;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      host.dataset.webgl = 'unavailable';
      return undefined;
    }
    host.dataset.webgl = 'ready';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 16.5);

    scene.add(new THREE.AmbientLight(0x8ba8c8, 1.8));
    const keyLight = new THREE.PointLight(0x52d6ff, 30, 22);
    keyLight.position.set(-3, 4, 6);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x6575ff, 24, 18);
    fillLight.position.set(4, -3, 4);
    scene.add(fillLight);

    const core = new THREE.Group();
    scene.add(core);
    const coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 2),
      new THREE.MeshStandardMaterial({ color: 0x163751, emissive: 0x087b9b, emissiveIntensity: 1.25, metalness: 0.5, roughness: 0.25 }),
    );
    core.add(coreMesh);
    const coreShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.79, 1),
      new THREE.MeshBasicMaterial({ color: 0x3de2ff, wireframe: true, transparent: true, opacity: 0.33 }),
    );
    core.add(coreShell);
    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.02, 0.012, 8, 100),
      new THREE.MeshBasicMaterial({ color: 0x47c8ed, transparent: true, opacity: 0.4 }),
    );
    coreRing.rotation.x = Math.PI / 2.4;
    core.add(coreRing);

    const nodeGroups: THREE.Group[] = [];
    const hitTargets: THREE.Mesh[] = [];
    const edgeMaterials: THREE.LineBasicMaterial[] = [];
    const particleMeshes: THREE.Mesh[] = [];
    const nodeColors = agents.map((a) => new THREE.Color(a.color));

    agents.forEach((agent, index) => {
      const group = new THREE.Group();
      group.position.copy(POSITIONS[index]);
      scene.add(group);
      nodeGroups.push(group);

      const color = nodeColors[index];
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.47, 0.025, 8, 56),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68 }),
      );
      ring.rotation.x = 0.25;
      group.add(ring);

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 28, 22),
        new THREE.MeshStandardMaterial({ color: 0x14273a, emissive: color, emissiveIntensity: 0.72, metalness: 0.35, roughness: 0.3 }),
      );
      group.add(orb);

      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 12, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitArea.userData.agentKey = agent.key;
      group.add(hitArea);
      hitTargets.push(hitArea);

      const glow = new THREE.PointLight(color, 2.2, 2.2);
      group.add(glow);
    });

    // Sequential specialist handoffs, from risk assessment through field guidance.
    agents.forEach((_, index) => {
      const from = POSITIONS[index];
      const to = POSITIONS[(index + 1) % POSITIONS.length];
      const curve = new THREE.QuadraticBezierCurve3(
        from,
        new THREE.Vector3((from.x + to.x) * 0.5, (from.y + to.y) * 0.5, 0.32),
        to,
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)),
        new THREE.LineBasicMaterial({ color: nodeColors[index], transparent: true, opacity: 0.3 }),
      );
      scene.add(line);
      edgeMaterials.push(line.material as THREE.LineBasicMaterial);

      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshBasicMaterial({ color: nodeColors[index], transparent: true, opacity: 0.95 }),
      );
      scene.add(particle);
      particleMeshes.push(particle);
      particle.userData.curve = curve;
      particle.userData.offset = index / agents.length;
    });

    // A sparse star field gives depth while keeping the operational labels dominant.
    const starGeometry = new THREE.BufferGeometry();
    const starPoints: number[] = [];
    let seed = 17;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 100; i += 1) {
      starPoints.push((random() - 0.5) * 11, (random() - 0.5) * 7.5, -1 - random() * 3);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x95bad4, size: 0.018, transparent: true, opacity: 0.56 })));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let frame = 0;
    let width = 1;
    let height = 1;
    let overviewDistance = 11.5;
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (event: MediaQueryListEvent) => { reducedMotion = event.matches; };
    motionQuery.addEventListener('change', handleMotionChange);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      overviewDistance = width < 560 ? 13.4 : 11.5;
      if (reducedMotion && !selectedRef.current) camera.position.set(0, 0, overviewDistance);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      renderer.domElement.style.cursor = raycaster.intersectObjects(hitTargets, false).length ? 'pointer' : 'default';
    };
    const handleClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0]?.object;
      if (hit?.userData.agentKey) selectRef.current(String(hit.userData.agentKey));
    };
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);

    const clock = new THREE.Clock();
    const cameraLookAt = new THREE.Vector3();
    let lastCameraFocus = selectedKey;
    let cameraTransition: {
      started: number;
      fromPosition: THREE.Vector3;
      toPosition: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toTarget: THREE.Vector3;
    } | null = null;
    const introStarted = clock.getElapsedTime();
    const introDuration = 1.45;
    const introCameraDistance = width < 560 ? 18.5 : 16.5;
    let introAmount = reducedMotion ? 1 : 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      introAmount = reducedMotion ? 1 : THREE.MathUtils.clamp((t - introStarted) / introDuration, 0, 1);
      const introEase = 1 - (1 - introAmount) ** 3;

      if (selectedRef.current !== lastCameraFocus) {
        lastCameraFocus = selectedRef.current;
        const focusIndex = agentsRef.current.findIndex((agent) => agent.key === lastCameraFocus);
        const target = focusIndex >= 0 ? POSITIONS[focusIndex].clone().multiplyScalar(0.9) : new THREE.Vector3();
        const focusedDistance = width < 560 ? 10.7 : 8.5;
        const destination = focusIndex >= 0
          ? new THREE.Vector3(target.x * 0.3, target.y * 0.25, focusedDistance)
          : new THREE.Vector3(0, 0, overviewDistance);
        if (reducedMotion) {
          camera.position.copy(destination);
          cameraLookAt.copy(target);
          cameraTransition = null;
        } else {
          cameraTransition = {
            started: t,
            fromPosition: camera.position.clone(),
            toPosition: destination,
            fromTarget: cameraLookAt.clone(),
            toTarget: target,
          };
        }
      }

      if (cameraTransition && reducedMotion) {
        camera.position.copy(cameraTransition.toPosition);
        cameraLookAt.copy(cameraTransition.toTarget);
        cameraTransition = null;
      } else if (cameraTransition) {
        const progress = THREE.MathUtils.clamp((t - cameraTransition.started) / 1.05, 0, 1);
        const ease = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
        camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, ease);
        cameraLookAt.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, ease);
        if (progress >= 1) cameraTransition = null;
      } else if (reducedMotion && !selectedRef.current) {
        camera.position.set(0, 0, overviewDistance);
        cameraLookAt.set(0, 0, 0);
      } else if (!reducedMotion && !selectedRef.current) {
        camera.position.set(0, 0, THREE.MathUtils.lerp(introCameraDistance, overviewDistance, introEase));
      }
      camera.lookAt(cameraLookAt);

      if (coreLabelRef.current) {
        const projected = new THREE.Vector3(0, 0, 0).project(camera);
        coreLabelRef.current.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
        coreLabelRef.current.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
        coreLabelRef.current.style.opacity = projected.z < 1 ? '1' : '0';
      }

      if (!reducedMotion) {
        core.rotation.y = t * 0.15;
        core.rotation.x = Math.sin(t * 0.22) * 0.08;
        coreRing.rotation.z = -t * 0.18;
        nodeGroups.forEach((node, i) => {
          const enter = THREE.MathUtils.clamp((introAmount - i * 0.08) / 0.7, 0, 1);
          const enterEase = 1 - (1 - enter) ** 3;
          node.position.x = POSITIONS[i].x * enterEase;
          node.position.y = POSITIONS[i].y * enterEase;
          node.position.z = Math.sin(t * 0.8 + i) * 0.12;
          node.rotation.y = Math.sin(t * 0.35 + i) * 0.13;
          const active = agentsRef.current[i]?.key === selectedRef.current;
          const scale = active ? 1.12 + Math.sin(t * 2.4) * 0.035 : 1;
          node.scale.setScalar(scale);
          edgeMaterials[i].opacity = active ? 0.62 : 0.25;
          particleMeshes[i].visible = agentsRef.current[i]?.state === 'ACTIVE' || agentsRef.current.every((a) => a.state === 'DEMO');
          const curve = particleMeshes[i].userData.curve as THREE.QuadraticBezierCurve3;
          const progress = (t * 0.16 + Number(particleMeshes[i].userData.offset)) % 1;
          particleMeshes[i].position.copy(curve.getPoint(progress));
        });
      } else {
        core.rotation.set(0, 0, 0);
        nodeGroups.forEach((node, index) => {
          node.position.copy(POSITIONS[index]);
          node.scale.setScalar(1);
        });
        particleMeshes.forEach((particle) => { particle.visible = false; });
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motionQuery.removeEventListener('change', handleMotionChange);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [agents.length]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.dataset.webgl !== 'ready') return;
    const activeIndex = agents.findIndex((agent) => agent.key === selectedKey);
    host.style.setProperty('--selected-agent-color', activeIndex >= 0 ? agents[activeIndex].color : '#48d7f2');
  }, [agents, selectedKey]);

  return (
    <div className="agent-constellation" ref={hostRef} aria-hidden="true">
      <div className="agent-constellation-fallback">Interactive agent network · select a specialist below</div>
      <div className="agent-constellation-core-label" ref={coreLabelRef}><span>MISSION</span><strong>CONTROL</strong></div>
    </div>
  );
}
