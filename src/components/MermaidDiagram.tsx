import React, { useEffect, useRef } from 'react';
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
  const hasRendered = useRef(false); // Prevent duplicate renders

  useEffect(() => {
    const renderMermaid = async () => {
      if (containerRef.current && !hasRendered.current && chart) {
        const currentContainer = containerRef.current; // Capture ref value
        try {
          // Render into the container, get result (MermaidAPI.RenderResult)
          const { svg } = await mermaid.render('mermaid-svg-' + Date.now(), chart);
          // Manually set innerHTML after successful render
          if (currentContainer) { // Check ref again in case component unmounted
             currentContainer.innerHTML = svg;
             hasRendered.current = true;
          }
        } catch (error) {
          console.error('Mermaid rendering error:', error);
          if (currentContainer) {
            currentContainer.innerHTML = `<pre>Error rendering Mermaid diagram:\n${error instanceof Error ? error.message : String(error)}</pre>`;
          }
          hasRendered.current = true; // Mark as rendered even on error
        }
      }
    };

    renderMermaid();

  }, [chart]); // Re-run effect if the chart code changes

  // Reset hasRendered flag when chart prop changes
  useEffect(() => {
    // Clear previous content when chart changes
    if (containerRef.current) {
      containerRef.current.innerHTML = ''; // Clear old diagram
    }
    hasRendered.current = false;
  }, [chart]);

  // Add some basic styling/placeholder
  return <div ref={containerRef} className="mermaid-container w-full flex justify-center p-4 bg-muted rounded my-2"> Rendering diagram... </div>;
};

export default MermaidDiagram; 