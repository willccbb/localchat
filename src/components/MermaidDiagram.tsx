'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

// Initialize Mermaid (run only once)
mermaid.initialize({
  startOnLoad: false, // We control rendering manually
  theme: 'neutral', // Or 'dark', 'forest', etc. Match your app's theme
  // You might need to configure securityLevel if dealing with external input,
  // but for internal use 'loose' is often fine.
  securityLevel: 'loose', 
  // Example font config (adjust if needed)
  // themeVariables: {
  //   fontFamily: 'inherit' 
  // } 
});

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // State to hold the rendered SVG or an error message
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

    const renderMermaid = async () => {
      if (!containerRef.current) return;
      
      // Reset state for re-renders
      setRenderedSvg(null);
      setRenderError(null);

      try {
        // Generate a unique ID for each diagram
        const id = `mermaid-${Math.random().toString(36).substring(7)}`;
        
        // Use mermaid.render to get SVG source
        const { svg } = await mermaid.render(id, chart);
        setRenderedSvg(svg); // Store successful SVG render

      } catch (error: any) {
        console.error('Mermaid rendering error:', error);
        // Store error message
        setRenderError(error instanceof Error ? error.message : String(error));
      }
    };

    renderMermaid();

  }, [chart]); // Re-render if the chart definition changes

  return (
    <div className="mermaid-container my-4 p-2 bg-muted rounded overflow-hidden">
      {renderError ? (
        // Display error and raw code on failure
        <div className="text-sm">
          <div className="text-red-600 font-semibold mb-2">
            ⚠️ Error rendering Mermaid diagram:
          </div>
          <pre className="text-xs bg-red-50 p-2 rounded overflow-x-auto">
            {renderError}
          </pre>
          <details className="mt-2 text-xs">
             <summary className="cursor-pointer">Show raw code</summary>
             <pre className="mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                {chart}
             </pre>
          </details>
        </div>
      ) : renderedSvg ? (
        // Display rendered SVG on success
        <div 
          ref={containerRef} 
          dangerouslySetInnerHTML={{ __html: renderedSvg }} 
        />
      ) : (
        // Show raw code while loading/before rendering
        <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
            {chart}
        </pre>
      )}
    </div>
  );
};

export default MermaidDiagram; 