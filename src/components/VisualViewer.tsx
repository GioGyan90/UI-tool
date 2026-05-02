import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, PerspectiveCamera } from '@react-three/drei';

interface VisualViewerProps {
  files: { name: string; content: string; language: string }[];
}

export const VisualViewer: React.FC<VisualViewerProps> = ({ files }) => {
  const isSVG = files.some(f => f.name.endsWith('.svg'));
  const jsFile = files.find(f => f.name.endsWith('.js'));
  const jsonFile = files.find(f => f.name.endsWith('.json'));
  const isThree = !!jsonFile || (!!jsFile && (jsFile.content.includes('THREE') || jsFile.content.includes('three')));

  if (isSVG) {
    const svgFile = files.find(f => f.name.endsWith('.svg'));
    if (!svgFile) return null;
    return (
      <div className="w-full aspect-square bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center p-4 border border-zinc-800">
        <div 
          dangerouslySetInnerHTML={{ __html: svgFile.content }} 
          className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
        />
      </div>
    );
  }

  if (isThree) {
    const jsonFile = files.find(f => f.name.endsWith('.json'));
    const jsFile = files.find(f => f.name.endsWith('.js'));
    
    let modelData: any[] = [];
    
    if (jsonFile) {
      try {
        modelData = JSON.parse(jsonFile.content);
        if (!Array.isArray(modelData)) modelData = [modelData];
      } catch (e) {
        console.error("Failed to parse 3D data", e);
      }
    } else if (jsFile) {
      // For JS files in chat, we can only really show them if they follow the data pattern
      // because we don't have a full module loader here (we're using R3F)
      const dataMatch = jsFile.content.match(/export const (?:modelData|sceneData|robotData|carData|data|assets) = (\[[\s\S]*?\]);/);
      if (dataMatch) {
        try {
          // Dangerous but simplified for preview
          modelData = eval(dataMatch[1]);
        } catch(e) {}
      }
    }

    if (modelData.length === 0) return null;

    return (
      <div className="w-full aspect-square bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 relative group">
        <div className="absolute top-2 left-2 z-10 text-[10px] text-zinc-500 bg-zinc-900/80 px-1.5 py-0.5 rounded">3D Preview</div>
        <Canvas gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <PerspectiveCamera makeDefault position={[4, 4, 4]} />
          <Suspense fallback={null}>
            <Stage environment="city" intensity={0.5} shadows="contact">
              {modelData.map((obj: any, i: number) => (
                <mesh key={i} position={obj.position || [0, 0, 0]} scale={obj.scale || [1, 1, 1]} rotation={obj.rotation || [0, 0, 0]}>
                  {obj.type === 'box' && <boxGeometry />}
                  {obj.type === 'sphere' && <sphereGeometry args={[0.7, 32, 32]} />}
                  {obj.type === 'torus' && <torusGeometry args={[0.5, 0.2, 16, 100]} />}
                  {obj.type === 'cone' && <coneGeometry args={[0.5, 1, 32]} />}
                  {obj.type === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
                  <meshStandardMaterial 
                    color={obj.color || 'purple'} 
                    metalness={obj.metalness || 0.6} 
                    roughness={obj.roughness || 0.2} 
                  />
                </mesh>
              ))}
            </Stage>
          </Suspense>
          <OrbitControls makeDefault autoRotate />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
        </Canvas>
      </div>
    );
  }

  return null;
};
