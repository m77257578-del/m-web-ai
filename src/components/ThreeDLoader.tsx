import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Sparkles, ArrowRight, BookOpen, Gem, ShieldCheck, Zap, LogIn } from 'lucide-react';

interface ThreeDLoaderProps {
  onComplete: () => void;
  onLoginClick?: () => void;
  onTripleClickLogo?: () => void;
}

export const ThreeDLoader: React.FC<ThreeDLoaderProps> = ({ onComplete, onLoginClick, onTripleClickLogo }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<number>(0);
  const [loadingPhase, setLoadingPhase] = useState<string>('تهيئة محرك الذكاء الاصطناعي السريع...');
  const [isReady, setIsReady] = useState<boolean>(false);
  const logoClickCountRef = useRef<number>(0);
  const logoClickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    logoClickCountRef.current += 1;
    if (logoClickTimerRef.current) clearTimeout(logoClickTimerRef.current);

    if (logoClickCountRef.current >= 3) {
      logoClickCountRef.current = 0;
      if (onTripleClickLogo) {
        onTripleClickLogo();
      }
    } else {
      logoClickTimerRef.current = setTimeout(() => {
        logoClickCountRef.current = 0;
      }, 1500);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b16, 0.035);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 2. Lighting Rig (Gold Amber & Royal Blue)
    const ambientLight = new THREE.AmbientLight(0x0a1638, 1.5);
    scene.add(ambientLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 5, 20);
    amberLight.position.set(3, 4, 3);
    scene.add(amberLight);

    const blueLight = new THREE.PointLight(0x2563eb, 4, 20);
    blueLight.position.set(-3, -2, 2);
    scene.add(blueLight);

    const frontLight = new THREE.DirectionalLight(0xfffbeb, 1.2);
    frontLight.position.set(0, 3, 5);
    scene.add(frontLight);

    // 3. Central 3D Composite Object: Egyptian Knowledge Core & Orbiting Gems
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // 3.1 Holographic Pyramid / Knowledge Prism (Egyptian Heritage)
    const pyramidGeo = new THREE.ConeGeometry(1.6, 2.2, 4);
    const pyramidMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.2,
      metalness: 0.8,
      wireframe: false,
      transparent: true,
      opacity: 0.75,
    });
    const pyramid = new THREE.Mesh(pyramidGeo, pyramidMat);
    pyramid.position.y = 0.2;
    pyramid.rotation.y = Math.PI / 4;
    coreGroup.add(pyramid);

    // 3.2 Golden Wireframe Overlay on Pyramid
    const wireGeo = new THREE.ConeGeometry(1.62, 2.22, 4);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    const wirePyramid = new THREE.Mesh(wireGeo, wireMat);
    wirePyramid.position.y = 0.2;
    wirePyramid.rotation.y = Math.PI / 4;
    coreGroup.add(wirePyramid);

    // 3.3 Golden Egyptian Sun Disc / Floating Energy Core
    const coreSphereGeo = new THREE.IcosahedronGeometry(0.55, 2);
    const coreSphereMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
    });
    const coreSphere = new THREE.Mesh(coreSphereGeo, coreSphereMat);
    coreSphere.position.y = 0.3;
    coreGroup.add(coreSphere);

    // 3.4 Orbiting Knowledge Rings (Torus)
    const ring1Geo = new THREE.TorusGeometry(2.3, 0.03, 16, 100);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xb45309,
      emissiveIntensity: 0.4
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    coreGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.6, 0.025, 16, 100);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.4
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = Math.PI / 6;
    coreGroup.add(ring2);

    // 3.5 Orbiting 3D Gems (Representing Gamification & Diamonds)
    const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.8
    });

    const gemsCount = 6;
    const gemsArray: THREE.Mesh[] = [];
    for (let i = 0; i < gemsCount; i++) {
      const g = new THREE.Mesh(gemGeo, gemMat);
      coreGroup.add(g);
      gemsArray.push(g);
    }

    // 3.6 Ambient Knowledge Stars / Stardust Field
    const starCount = 900;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    const colorGold = new THREE.Color(0xf59e0b);
    const colorCyan = new THREE.Color(0x38bdf8);
    const colorWhite = new THREE.Color(0xffffff);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const radius = 4 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPos[i3] = radius * Math.sin(phi) * Math.cos(theta);
      starPos[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPos[i3 + 2] = radius * Math.cos(phi);

      const chosenColor = Math.random() > 0.5 ? colorGold : (Math.random() > 0.5 ? colorCyan : colorWhite);
      starColors[i3] = chosenColor.r;
      starColors[i3 + 1] = chosenColor.g;
      starColors[i3 + 2] = chosenColor.b;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 4. Mouse Interactive Parallax
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 5. Resize Listener
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    // 6. Animation Loop with Clock
    const clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth central object rotation
      coreGroup.rotation.y = elapsedTime * 0.45;
      coreGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.12;

      // Parallax camera lerp
      camera.position.x += (mouseX * 0.6 - camera.position.x) * 0.05;
      camera.position.y += (1.2 + mouseY * 0.4 - camera.position.y) * 0.05;
      camera.lookAt(0, 0.2, 0);

      // Rings differential rotation
      ring1.rotation.z = elapsedTime * 0.6;
      ring2.rotation.z = -elapsedTime * 0.5;

      // Gem orbits
      gemsArray.forEach((gem, idx) => {
        const angle = (idx / gemsCount) * Math.PI * 2 + elapsedTime * 0.8;
        const radius = 2.45;
        gem.position.x = Math.cos(angle) * radius;
        gem.position.z = Math.sin(angle) * radius;
        gem.position.y = Math.sin(angle * 2 + elapsedTime) * 0.4 + 0.2;
        gem.rotation.x += 0.03;
        gem.rotation.y += 0.04;
      });

      // Slowly rotate starfield
      starField.rotation.y = elapsedTime * 0.04;
      starField.rotation.x = elapsedTime * 0.02;

      // Dynamic light intensity pulsation
      amberLight.intensity = 4 + Math.sin(elapsedTime * 3) * 1.5;

      renderer.render(scene, camera);
    };

    animate();

    // 7. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      // Dispose Three.js objects
      pyramidGeo.dispose();
      pyramidMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      coreSphereGeo.dispose();
      coreSphereMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      gemGeo.dispose();
      gemMat.dispose();
      starGeo.dispose();
      starMat.dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Progress simulation matching actual startup tasks
  useEffect(() => {
    const phases = [
      { at: 15, text: 'تهيئة محرك الذكاء الاصطناعي (Gemini 3.1 Flash Lite)...' },
      { at: 35, text: 'تحميل مناهج وزارة التربية والتعليم المصرية لجميع الصفوف...' },
      { at: 60, text: 'مزامنة بنك الأسئلة وقواعد بيانات Firestore والشهادات...' },
      { at: 85, text: 'تجهيز ملف data.json وبيئة التثبيت السريع PWA...' },
      { at: 100, text: 'تم اكتمال التجهيز! المنصة جاهزة للانطلاق 🚀' },
    ];

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsReady(true);
          return 100;
        }
        const next = Math.min(100, prev + Math.floor(Math.random() * 6) + 3);
        const currentPhase = phases.find(p => next <= p.at) || phases[phases.length - 1];
        setLoadingPhase(currentPhase.text);
        if (next === 100) {
          setIsReady(true);
        }
        return next;
      });
    }, 60);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#070B16] text-white overflow-hidden select-none">
      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-auto" />

      {/* Subtle Gradient Vignette overlays */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#070B16] via-transparent to-[#070B16]/80" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,#070B16_90%)]" />

      {/* Top Brand Header */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer select-none" onClick={handleLogoClick} title="M Web AI">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-blue-600 p-0.5 shadow-xl shadow-amber-500/20">
            <div className="w-full h-full bg-[#0A0F1D] rounded-[14px] flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>M Web AI</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                مناهج مصر 🇪🇬
              </span>
            </h1>
            <p className="text-xs text-slate-400">بوابة الذكاء الاصطناعي للمذاكرة والامتحانات والشهادات</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onLoginClick && (
            <button
              onClick={() => {
                onComplete();
                onLoginClick();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>تسجيل الدخول</span>
            </button>
          )}
          <button
            onClick={onComplete}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-bold transition-all backdrop-blur-sm cursor-pointer"
          >
            تخطي ⏩
          </button>
        </div>
      </div>

      {/* Center 3D Floating Tagline */}
      <div className="relative z-10 text-center px-4 max-w-lg mx-auto pointer-events-none mt-auto mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 text-xs font-bold mb-3 shadow-sm backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          <span>تحميل ثلاثي الأبعاد تفاعلي</span>
          <Gem className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white font-serif tracking-tight drop-shadow-md">
          صُنعت خصيصاً لتفوق طلاب مصر
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
          حل المسائل بالصور · شرح الدروس · بنك امتحانات بالذكاء الاصطناعي · شهادات معتمدة
        </p>
      </div>

      {/* Bottom Progress Bar & Enter Action */}
      <div className="relative z-10 w-full max-w-md mx-auto px-6 pb-10">
        <div className="bg-[#101932]/90 border border-blue-900/60 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-300">
            <span className="text-amber-300 truncate max-w-[280px]">{loadingPhase}</span>
            <span className="font-mono font-bold text-white text-sm">{progress}%</span>
          </div>

          {/* Glowing Animated Progress Bar */}
          <div className="w-full bg-[#0A0F1D] rounded-full h-3 p-0.5 border border-blue-900/60 overflow-hidden relative">
            <div
              className="bg-gradient-to-r from-blue-600 via-amber-500 to-yellow-400 h-full rounded-full transition-all duration-150 ease-out shadow-lg shadow-amber-500/30"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Action button */}
          <div className="mt-4">
            {isReady ? (
              <button
                onClick={onComplete}
                className="w-full py-3 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-amber-500/30 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer animate-pulse"
              >
                <span>دخول المنصة وبدء المذاكرة الآن</span>
                <ArrowRight className="w-4 h-4 transform rotate-180" />
              </button>
            ) : (
              <div className="text-center text-[11px] text-slate-400 font-mono py-1 flex items-center justify-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                <span>جاري تحميل العناصر ثلاثية الأبعاد والتطابق مع المناهج...</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Credit */}
        <div className="text-center text-[11px] text-slate-500 mt-4 flex items-center justify-center gap-1">
          <span>تطوير شركة</span>
          <a
            href="https://m-web-psi.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 font-bold hover:underline"
          >
            M Web
          </a>
          <span>· الإصدار 1.2.0</span>
        </div>
      </div>
    </div>
  );
};
