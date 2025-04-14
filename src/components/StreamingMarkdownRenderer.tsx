'use client';

import React, { useEffect, useRef, memo } from 'react';
// Revert to namespace import
import * as smd from 'streaming-markdown'; 

interface StreamingMarkdownRendererProps {
  streamingText: string; // The full, accumulating text
  // Add a prop to signal when the stream is definitively finished 
  // (optional, but helps ensure parser_end is called correctly)
  isStreamFinished?: boolean; 
}

// Use React.memo to prevent unnecessary re-renders if props haven't changed
const StreamingMarkdownRenderer: React.FC<StreamingMarkdownRendererProps> = memo(({ streamingText, isStreamFinished }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parserRef = useRef<any>(null); // Store the parser instance
  const prevTextLengthRef = useRef(0); // Track previous text length

  // Initialize parser and renderer when container is ready
  useEffect(() => {
    if (containerRef.current && !parserRef.current) {
      const renderer = smd.default_renderer(containerRef.current);
      parserRef.current = smd.parser(renderer);
      console.log('StreamingMarkdown parser initialized.');
      // Initial render if text already exists (e.g., component remount)
      if (streamingText) {
          smd.parser_write(parserRef.current, streamingText);
          prevTextLengthRef.current = streamingText.length;
      }
    }
    // Intentionally run only once on mount or when containerRef becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []); 

  // Process text changes (deltas)
  useEffect(() => {
    if (!parserRef.current || !containerRef.current) return;

    const parser = parserRef.current;
    
    // Calculate the delta (new text added since last render)
    const currentTextLength = streamingText.length;
    const delta = streamingText.substring(prevTextLengthRef.current);
    
    // Write only the delta to the parser
    if (delta) {
      // Do NOT clear innerHTML - the library appends
      smd.parser_write(parser, delta);
      // console.log('StreamingMarkdown wrote delta:', delta);
    }

    // Update previous text length reference
    prevTextLengthRef.current = currentTextLength;

  }, [streamingText]); // Re-run only when streamingText changes

  // Handle stream end or reset
  useEffect(() => {
     // Reset parser and clear display when streamingText is empty
     if (streamingText === '' && parserRef.current && containerRef.current) {
        console.log('Streaming text empty, calling parser_end and clearing.');
        smd.parser_end(parserRef.current); // Reset parser state
        containerRef.current.innerHTML = ''; // Clear display
        prevTextLengthRef.current = 0;
     }
     // Also call end if the stream is flagged as finished externally
     // This handles cases where the stream ends but streamingText might not be empty immediately
     if (isStreamFinished && parserRef.current) {
         console.log('Stream finished externally, calling parser_end.');
         smd.parser_end(parserRef.current); // Reset parser state
         // Don't clear innerHTML here, let the final text remain
     }

  }, [streamingText, isStreamFinished]);

  // Cleanup on unmount
  useEffect(() => {
    // Store ref value in variable for cleanup function
    const parserInstance = parserRef.current;
    return () => {
      if (parserInstance) {
        smd.parser_end(parserInstance); 
        console.log('StreamingMarkdown parser ended on unmount.');
      }
    };
  }, []); // Empty dependency array ensures this runs only on unmount

  return (
    <div 
      ref={containerRef} 
      className="prose dark:prose-invert prose-sm max-w-none w-full break-words"
    >
      {/* Content rendered here by streaming-markdown library */}
    </div>
  );
});

StreamingMarkdownRenderer.displayName = 'StreamingMarkdownRenderer';

export default StreamingMarkdownRenderer; 