import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'; // Import router components and useNavigate
// Use Tauri v2 standard import paths
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { confirm } from '@tauri-apps/plugin-dialog';
// import { emit } from '@tauri-apps/api/event'; // Import emit // REMOVE
// No direct opener import needed now
// import * as opener from '@tauri-apps/plugin-opener'; 
// Import clipboard API module
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import './App.css'; // We can add styles here later
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math'; // Import remark-math
import rehypeKatex from 'rehype-katex'; // Import rehype-katex
import rehypeHighlight from 'rehype-highlight'; // Import rehype-highlight
import rehypeRaw from 'rehype-raw'; // Import rehype-raw
import { Button } from "@/components/ui/button"; // Import shadcn Button
// Use Tauri v2 clipboard API
// Attempting core clipboard API import
// import { clipboard } from '@tauri-apps/api';
import { Plus, Settings, Trash2, Pencil, ClipboardCopy, Check, RefreshCw } from "lucide-react"; 
import { Textarea } from "@/components/ui/textarea"; // Import Textarea
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components
import { cn } from "@/lib/utils"; // Import cn utility
import { Label } from "@/components/ui/label"; // Import Label
import { Input } from "@/components/ui/input"; // Import Input
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"; // Import Card components
import MermaidDiagram from '@/components/MermaidDiagram'; // Import Mermaid component
// Remove StreamingMarkdownRenderer import
// import StreamingMarkdownRenderer from '@/components/StreamingMarkdownRenderer'; 
import { ScrollArea } from "@/components/ui/scroll-area"
import { v4 as uuidv4 } from 'uuid'; // For generating temporary IDs
import { Components } from 'react-markdown'; // Import Components type
// Create a store instance (use '.settings.dat' for the filename)
import { LazyStore } from '@tauri-apps/plugin-store'; // <<< RE-ADD IMPORT >>>

// Remove unused Select types
/*
import type { 
  SelectProps, 
  SelectContentProps, 
  SelectItemProps, 
  SelectTriggerProps, 
  SelectValueProps 
} from "@radix-ui/react-select";
*/

// Define the TypeScript interface for Conversation (matching Rust struct)
// Ideally, this would be in a separate types.ts file
interface Conversation {
  id: string; // UUID
  title: string;
  created_at: string; // ISO 8601 date string
  last_updated_at: string; // ISO 8601 date string
  model_config_id: string; // UUID
}

// Define the TypeScript interface for Message
interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO 8601 date string
  metadata?: string;
}

// Add ModelConfig interface
interface ModelConfig {
  id: string; // UUID
  name: string;
  provider: string;
  api_url: string;
  api_key_ref?: string; // e.g., 'env:VAR_NAME' or 'keyring'
  provider_options?: string; // JSON string
}

// Define props for SettingsPage
interface SettingsPageProps {
  onModelsChanged: () => Promise<void>; // Callback to refresh models in parent
  availableModels: ModelConfig[]; // <<< ADD availableModels >>>
  utilityModelConfigId: string | null; // <<< ADD utilityModelConfigId >>>
  setUtilityModelConfigId: (id: string | null) => void; // <<< ADD setter >>>
}

// Use LazyStore for instantiation
const settingsStore = new LazyStore('.settings.dat'); 

// Settings Page Component accepting props
const SettingsPage = ({ 
  onModelsChanged, 
  availableModels, 
  utilityModelConfigId, 
  setUtilityModelConfigId 
}: SettingsPageProps) => {
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null); // State for editing

  // State for the form (used for both add and edit)
  const [formName, setFormName] = useState('');
  const formProvider = 'openai_compatible'; // Hardcode for now
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiKeyRef, setFormApiKeyRef] = useState('env:OPENAI_API_KEY');
  const [formModelName, setFormModelName] = useState('gpt-4o-mini');

  // Ref for the form card to scroll to it when editing starts
  const formCardRef = useRef<HTMLDivElement>(null);

  // Helper to parse model name from provider_options JSON
  const getModelNameFromOptions = (options?: string): string => {
      if (!options) return 'N/A';
      try {
          const parsed = JSON.parse(options);
          return parsed.model || 'N/A';
      } catch (e) {
          console.error("Failed to parse provider_options:", options, e);
          return 'Invalid JSON';
      }
  };

  // Fetch model configs on mount (now uses availableModels from props)
  useEffect(() => {
    // Use the models passed down from App
    setModelConfigs(availableModels);
        setIsLoading(false);
    // No need to fetch here anymore
    /*
    async function loadModelConfigs() {
      // ... (old fetching logic)
    }
    loadModelConfigs();
    */
  }, [availableModels]); // Depend on availableModels prop

  // Reset form fields to default/empty state
  const resetForm = () => {
    setFormName('');
    setFormApiUrl('');
    setFormApiKeyRef('env:OPENAI_API_KEY');
    setFormModelName('gpt-4o-mini');
    setEditingConfigId(null);
  };

  // Handle starting the edit process
  const handleStartEditing = (config: ModelConfig) => {
    setEditingConfigId(config.id);
    setFormName(config.name);
    setFormApiUrl(config.api_url);
    setFormApiKeyRef(config.api_key_ref || ''); // Use empty string if null/undefined
    setFormModelName(getModelNameFromOptions(config.provider_options));
    setError(null); // Clear any previous errors
    // Scroll form into view
    formCardRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle canceling the edit process
  const handleCancelEditing = () => {
    resetForm();
  };

  // Handle saving (add or update) model config
  const handleSaveModelConfig = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setError(null);
    setIsLoading(true); 

    let providerOptionsJson: string | undefined = undefined;
    if (formModelName.trim()) {
        try {
            providerOptionsJson = JSON.stringify({ model: formModelName.trim() });
        } catch (jsonErr) {
            setError('Invalid format for model name leading to JSON error.');
            setIsLoading(false);
            return;
        }
    }

    const configData = {
        id: editingConfigId ?? uuidv4(),
        name: formName.trim(),
        provider: formProvider,
        api_url: formApiUrl.trim(),
        api_key_ref: formApiKeyRef.trim() || undefined,
        provider_options: providerOptionsJson,
    };

    // Validation
    if (!configData.name || !configData.provider || !configData.api_url) {
        setError("Name, Provider, and API URL are required.");
        setIsLoading(false);
        return;
    }
    if (configData.provider === 'openai_compatible' && !formModelName.trim()) {
        setError("Model Name is required for openai_compatible provider.");
        setIsLoading(false);
        return;
    }

    try {
      if (editingConfigId) {
        // --- UPDATE LOGIC ---
        console.log(`Invoking update_model_config for ${editingConfigId}...`, configData);
        // Pass ONLY the config object, which now includes the ID
        await invoke('update_model_config', { config: configData });
        console.log('Updated model config');

        // Update state locally
        const updatedConfigs = await invoke<ModelConfig[]>('list_model_configs'); // Re-fetch for consistency
        setModelConfigs(updatedConfigs);
        await onModelsChanged(); // Refresh models in parent
        resetForm(); // Clear form and exit editing mode

      } else {
        // --- ADD LOGIC ---
        console.log('Invoking add_model_config with generated ID...', configData);
        await invoke('add_model_config', { config: configData });
        console.log('Added model config');
        
        const fetchedConfigs = await invoke<ModelConfig[]>('list_model_configs');
        setModelConfigs(fetchedConfigs);
        await onModelsChanged(); // Refresh models in parent
        resetForm(); // Clear form
      }
    } catch (err) {
      console.error(`Error ${editingConfigId ? 'updating' : 'adding'} model config:`, err);
        setError(String(err));
      // Keep form populated on error so user can retry
    } finally {
        setIsLoading(false);
    }
  };

  // Handle deleting a model configuration
  const handleDeleteModelConfig = async (idToDelete: string) => {
    // Prevent deleting while editing the same item
    if (editingConfigId === idToDelete) {
        setError("cannot delete the configuration while editing it. please cancel editing first.");
        return;
    }

    console.log(`handleDeleteModelConfig called for ID: ${idToDelete}`); 
    const confirmed = await confirm('Are you sure you want to delete this model configuration?', {
         title: 'confirm deletion'
     });
    if (!confirmed) return;

    setError(null);
    setIsLoading(true);
    try {
        console.log(`Invoking delete_model_config for ${idToDelete}...`);
        await invoke('delete_model_config', { configId: idToDelete });
        console.log('deleted model config');
        const updatedConfigs = modelConfigs.filter(mc => mc.id !== idToDelete)
        setModelConfigs(updatedConfigs);
        await onModelsChanged(); // Refresh models in parent
    } catch (err) { 
        console.error('error deleting model config:', err);
        setError(String(err));
    } finally { 
        setIsLoading(false);
    }
};

  // Handle changing the utility model (use async/await with LazyStore instance)
  const handleUtilityModelChange = async (newModelId: string) => {
    setUtilityModelConfigId(newModelId);
    console.log('Utility model selection changed to:', newModelId);
    try {
      await settingsStore.set('utilityModelConfigId', newModelId);
      await settingsStore.save(); // Save after setting
      console.log('Saved utility model setting successfully.');
    } catch (err: unknown) {
      console.error("Failed to save utility model setting:", err);
    }
  };

  return (
    // Make the OUTERMOST element the ScrollArea
    <ScrollArea 
      className={cn(
        "px-6 pt-6 pb-6 h-full" // Keep padding, remove relative and fade classes
      )}
    >
      {/* Place all content directly inside ScrollArea */}
      <h1 className="text-2xl font-semibold mb-6">settings</h1> {/* Lowercase */}

      {error && (
        <div className="text-red-600 bg-red-100 p-3 rounded-md mb-6"> {/* REMOVED flex-shrink-0 */} 
          Error: {error}
        </div>
      )}

      {/* Original Content wrapper - NO LONGER needs ScrollArea */}
      <div className="space-y-6">

         {/* --- Utility Model Selector Card --- */}
        <Card>
          <CardHeader>
             <CardTitle>utility model</CardTitle> {/* Lowercase */}
           </CardHeader>
           <CardContent>
              <Label htmlFor="utility-model-select" className="mb-2 block">select model for background tasks (e.g., naming)</Label> {/* Lowercase */}
              <Select 
                value={utilityModelConfigId ?? ''} // Use empty string if null
                onValueChange={handleUtilityModelChange}
              >
                <SelectTrigger id="utility-model-select" className="w-full">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.length === 0 ? (
                     <SelectItem value="none" disabled>No models available</SelectItem>
                  ) : (
                    availableModels.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
           </CardContent>
         </Card>

        <Card>
          <CardHeader>
            <CardTitle>model configurations</CardTitle> {/* Lowercase */}
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && !editingConfigId && <p>Loading configurations...</p>} {/* Hide loading text when editing */}
            {!isLoading && modelConfigs.length === 0 && <p>No configurations found.</p>}
            {modelConfigs.map(config => (
              <Card key={config.id} className="p-4 flex justify-between items-center">
                <div className="space-y-1 flex-grow min-w-0 mr-4">
                  <div className="font-medium break-words">{config.name}</div>
                  <div className="text-sm text-muted-foreground break-words">id = {getModelNameFromOptions(config.provider_options)}</div>
                  <div className="text-sm text-muted-foreground break-words">url = {config.api_url}</div>
                  <div className="text-sm text-muted-foreground break-words">key = {config.api_key_ref || 'N/A'}</div>
                </div>
                {/* Buttons Container */}
                <div className="flex flex-col space-y-1 items-end flex-shrink-0">
                   <Button
                      size="sm"
                      onClick={() => handleStartEditing(config)}
                      disabled={isLoading || !!editingConfigId} // Disable if loading or already editing another
                      className="w-24 justify-start" // Fixed width and align text
                    >
                      <Pencil className="h-4 w-4 mr-1" /> edit {/* Lowercase */}
                    </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteModelConfig(config.id)}
                      disabled={isLoading || !!editingConfigId} // Disable if loading or editing
                      className="w-24 justify-start" // Fixed width and align text
                >
                      <Trash2 className="h-4 w-4 mr-1" /> delete {/* Lowercase */}
                </Button>
                </div>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Add/Edit Form Card */}
        <div className="pt-6 border-t" ref={formCardRef}> {/* Add ref here */}
        <Card>
          <CardHeader>
              {/* Dynamic Title */}
              <CardTitle>{editingConfigId ? 'edit model configuration' : 'add new model'}</CardTitle> {/* Lowercase */}
          </CardHeader>
            {/* Use the unified save handler */}
            <form onSubmit={handleSaveModelConfig}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                  <Label htmlFor="formName">name</Label> {/* Lowercase */}
                  {/* Use form state variables */}
                  <Input id="formName" value={formName} onChange={e => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="formApiUrl">api url</Label> {/* Lowercase */}
                  <Input id="formApiUrl" type="url" value={formApiUrl} onChange={e => setFormApiUrl(e.target.value)} required placeholder="e.g., https://api.openai.com/v1" />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="formApiKeyRef">api key ref</Label> {/* Lowercase */}
                  <Input id="formApiKeyRef" value={formApiKeyRef} onChange={e => setFormApiKeyRef(e.target.value)} placeholder="e.g., env:MY_KEY or keyring" />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="formModelName">model id</Label> {/* Lowercase */}
                  <Input id="formModelName" value={formModelName} onChange={e => setFormModelName(e.target.value)} required placeholder="e.g., gpt-4o-mini" />
              </div>
            </CardContent>
              <CardFooter className="flex justify-between"> {/* Use flex justify-between */}
                {/* Dynamic Submit Button Text */}
              <Button type="submit" disabled={isLoading}>
                  {isLoading ? (editingConfigId ? 'Updating...' : 'Adding...') : (editingConfigId ? 'update configuration' : 'add configuration')} {/* Lowercase */}
              </Button>
                {/* Cancel Button (only shown when editing) */}
                {editingConfigId && (
                  <Button type="button" variant="outline" onClick={handleCancelEditing} disabled={isLoading}>
                    cancel {/* Lowercase */}
                  </Button>
                )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
    </ScrollArea>
  );
};

// Main Chat Area Component - Remove streaming props
const ChatArea = ({ 
  currentMessages, 
  currentInput, 
  setCurrentInput, 
  handleSendMessage,
  currentConversation,
  availableModels,
  handleModelChange,
  handleStopGeneration,
  handleCopy,
  handleRegenerate,
  copiedMessageId,
  isLoading,
  streamingMessageId,
}: { 
  currentMessages: Message[], 
  currentInput: string, 
  setCurrentInput: (val: string) => void, 
  handleSendMessage: () => void,
  currentConversation: Conversation | undefined,
  availableModels: ModelConfig[],
  handleModelChange: (newModelConfigId: string) => Promise<void>,
  handleStopGeneration: () => Promise<void>,
  handleCopy: (id: string, content: string) => Promise<void>,
  handleRegenerate: () => Promise<void>,
  copiedMessageId: string | null,
  isLoading: boolean,
  streamingMessageId: string | null | undefined,
}) => {
  // console.log('ChatArea received:', { isCurrentConversationStreaming }); // REMOVE LOG
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Define components statically outside the map --- 
  const markdownComponents: Components = {
    // Custom link renderer
    a: ({node, href, ...props}) => {
      const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault(); // Prevent default navigation
        if (href) {
          // Invoke the Rust command `open_url`
          invoke('open_url', { url: href })
            .catch((err: any) => console.error("Failed to invoke open_url:", err));
        }
      };
      // Render an anchor tag, but handle click via invoke
      return <a href={href} onClick={handleClick} {...props} />;
    },

    // Custom code renderer (REMOVE conditional rendering)
    code({ node, className, children, style, ...rest }) {
      // const isCurrentlyStreaming = isCurrentConversationStreaming;
      // if (isCurrentlyStreaming) { ... } // REMOVE BLOCK

      // Always use full rendering logic
      const match = /language-(\w+)/.exec(className || '');
      if (match && match[1] === 'mermaid') {
         return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
      }
      const finalClassName = match ? cn(className, "overflow-x-auto w-full") : className;
  return (
        <code {...rest} className={finalClassName}>
          {children}
        </code>
      );
    },

    // Custom pre renderer (REMOVE conditional rendering)
    pre: ({ node, children, className: initialClassName, ...props }: any) => {
      // const isCurrentlyStreaming = isCurrentConversationStreaming;
      // if (isCurrentlyStreaming) { ... } // REMOVE BLOCK

      // Always use full rendering logic
      let isCodeBlock = false;
      if (React.isValidElement(children) && children.type === 'code') {
         // Check if the direct child is a <code> element, indicating a block
         isCodeBlock = true;
      }
      const finalClassName = isCodeBlock 
        ? cn(initialClassName, "block overflow-x-auto w-full relative") // Keep relative for potential buttons
        : initialClassName; 
      return (
        <pre {...props} className={finalClassName}>
          {children}
        </pre>
      );
    },
  };

  return (
    <div className="flex flex-col w-full h-full"> 
      {/* Top Bar: Model Selector - Restore padding, keep shrink */}
      {currentConversation && availableModels.length > 0 && (
        <div data-tauri-drag-region className="w-full flex-shrink-0"> {/* Apply drag region to outer wrapper */} 
          <div className="p-3 border-b border-border flex justify-end"> {/* Inner container for padding/layout */} 
            {/* Shadcn Select component */}
          <Select
            value={currentConversation.model_config_id}
            onValueChange={handleModelChange}
          >
              {/* Trigger contains the visual element */} 
              <SelectTrigger className="w-[220px]">
                {/* Value displays the selected value, with a placeholder */}
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
              {/* Content contains the dropdown items */} 
            <SelectContent>
              {availableModels.map(model => (
                  // Item represents each option 
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>
      )}

      {/* Message list - Use ScrollArea */}
      <ScrollArea 
        className="flex-grow px-6 pb-0 min-h-0"
      >
        <div className="h-4 flex-shrink-0"></div> {/* Top spacer */} 
        {currentMessages.map((msg, index) => {
          const displayContent = msg.content; 
          // <<< Check if THIS message is the one currently streaming >>>
          const isThisMessageStreaming = msg.id === streamingMessageId;

          return (
           <div 
             key={msg.id}
              className={cn(
               "group relative flex mb-4", 
               msg.role === 'user' ? 'justify-end' : 'justify-start'
             )}
           >
            <div 
              className={cn(
                "p-3 rounded-lg min-w-0 max-w-full", 
                msg.role === 'user' ? 'bg-secondary text-foreground' : ''
              )}
            >
              {/* <<< ALWAYS Render with ReactMarkdown >>> */}
              <div className="prose dark:prose-invert prose-sm \n                           break-words \n                           prose-p:m-0 prose-pre:m-2 prose-pre:p-0 prose-pre:bg-transparent \n                           prose-table:block prose-table:max-w-none prose-table:overflow-x-auto prose-table:min-w-full">
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
                    components={markdownComponents}
                >
                     {typeof displayContent === 'string' ? displayContent : ''}
                </ReactMarkdown>
              </div>
              {/* === ACTION BUTTONS START === */}
              <div className="absolute bottom-1 right-1 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5">
                {/* Copy Button */}
              <Button 
                variant="ghost"
                size="icon"
                  className="h-6 w-6"
                  onClick={() => handleCopy(msg.id, displayContent)}
                  title="Copy"
                >
                  {copiedMessageId === msg.id ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <ClipboardCopy className="h-4 w-4" />
                  )}
                </Button>

                {/* Regenerate Button (Conditional) */}
                {index === currentMessages.length - 1 && msg.role === 'assistant' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleRegenerate}
                    disabled={isLoading} // Disable if loading
                    title="Regenerate"
                  >
                    <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
              {/* === ACTION BUTTONS END === */}
      </div>
           </div>
          );
        })}
        <div ref={messagesEndRef} /> 
        <div className="h-10 flex-shrink-0"></div> 
      </ScrollArea>

      {/* Input Area / Stop Button Container - REMOVED justify-center */}
      <div className="px-6 pb-4 flex-shrink-0">
        {isLoading ? (
          // Wrap Stop Button in a centering div
          <div className="flex justify-center">
            <Button variant="secondary" onClick={handleStopGeneration} className="font-normal text-zinc-700">
                Stop
            </Button>
          </div>
        ) : (
          // Show Input Form when not streaming - ADD w-full to form
        <form 
            className="flex items-center w-full" 
          onSubmit={(e) => { 
            e.preventDefault(); 
            handleSendMessage(); 
          }}
        >
          <Textarea
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
              placeholder="type your message..." // Lowercase
              className="relative z-10 flex-grow resize-none bg-secondary border-0 rounded-md p-3 focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent shadow-[0px_0px_20px_20px_rgba(255,255,255,1.0)]"
              rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
              disabled={isLoading} // Also disable textarea just in case
            />
        </form>
        )}
      </div>
    </div>
  );
};

// Define the structure of the chunk payload from backend (No isFirstChunk)
interface AssistantMessageChunk {
  conversationId: string;
  messageId: string; // The ID of the message being streamed
  delta: string; // The content chunk
  // isFirstChunk: boolean; // REMOVED
}

// Define the structure for the NEW stream started event
interface AssistantStreamStarted {
  conversationId: string;
  messageId: string;
}

// Define the structure for the stream finished event
interface AssistantStreamFinished {
  messageId: string;
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation(); // Get current location
  const navigate = useNavigate(); // For navigation
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [utilityModelConfigId, setUtilityModelConfigId] = useState<string | null>(null);
  
  // <<< ADD State for triggering conversation list refresh >>>
  const [needsConversationRefresh, setNeedsConversationRefresh] = useState(false);

  // <<< ADD State for per-conversation streaming status >>>
  const [streamingStatus, setStreamingStatus] = useState<Record<string, boolean>>({});
  // <<< RE-ADD streamingMessagesRef for ID mapping >>>
  const streamingMessagesRef = useRef<Record<string, string | null>>({});

  // --- RE-ADD Ref to map message IDs back to conversation IDs --- 
  const messageIdToConvoIdMapRef = useRef<Record<string, string>>({});
  
  // <<< ADD Refs to hold listener cleanup functions >>>
  const unlistenStartedRef = useRef<(() => void) | null>(null);
  const unlistenChunkRef = useRef<(() => void) | null>(null);
  const unlistenFinishedRef = useRef<(() => void) | null>(null);
  const unlistenUpdatedRef = useRef<(() => void) | null>(null);

  // <<< ADD Ref to store partial content for ongoing streams >>>
  const partialContentRef = useRef<Record<string, string>>({});

  // Refs to access latest state in callbacks
  const currentConversationIdRef = useRef<string | null>(currentConversationId);
  const conversationsRef = useRef<Conversation[]>(conversations);
  const utilityModelConfigIdRef = useRef<string | null>(utilityModelConfigId);

  // --- Effects to keep refs updated ---
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    utilityModelConfigIdRef.current = utilityModelConfigId;
  }, [utilityModelConfigId]);

  // Helper to find the full Conversation object
  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // Helper to find the full ModelConfig object
  // const currentModelConfig = availableModels.find(m => m.id === currentConversation?.model_config_id); // REMOVE

  // Function to load all conversations (WRAPPED IN useCallback)
  const loadConversations = useCallback(async () => {
    console.log("Loading conversations...");
    setError(null);
    try {
      const convos = await invoke<Conversation[]>('list_conversations');
      console.log("Loaded conversations:", convos);
      // Sort by last_updated_at descending (most recent first)
      convos.sort((a, b) => new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime());
      setConversations(convos);

      // --- Refined Auto-Selection Logic --- 
      // <<< Use Ref for current ID to avoid stale state in closure >>>
      const currentId = currentConversationIdRef.current;
      const stillExists = currentId && convos.some(c => c.id === currentId);
      // Auto-select first convo ONLY if no convo is selected OR the selected one disappeared
      if ((!currentId || !stillExists) && convos.length > 0) {
        const firstConvoId = convos[0].id;
        setCurrentConversationId(firstConvoId);
        navigate(`/chat/${firstConvoId}`, { replace: true }); // Navigate to the first convo
        console.log(`Auto-selecting first conversation: ${firstConvoId} (Previous ID: ${currentId}, Existed: ${stillExists})`);
      } else {
        console.log(`Keeping current conversation selected: ${currentId}`);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
      setError(String(err));
    }
  }, [navigate, setConversations, currentConversationIdRef]); // <<< Update dependencies >>>

  // Function to load messages for a specific conversation
  const loadMessages = useCallback(async (conversationId: string | null) => {
    console.log(`[loadMessages ENTERED] for conversationId: ${conversationId}`); 
    if (!conversationId) {
      setCurrentMessages([]);
      return;
    }
    // <<< REMOVE Explicitly clear messages before loading >>>
    // setCurrentMessages([]); 
    console.log(`Loading messages for conversation ${conversationId}...`);
    setError(null);
    try {
      const msgs = await invoke<Message[]>('get_conversation_messages', { conversationId });
      // <<< ADD Log to inspect fetched messages >>>
      console.log(`[loadMessages Raw Result for ${conversationId}]`, msgs);
      
      msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setCurrentMessages(msgs);
    } catch (err) {
      console.error(`Error loading messages for ${conversationId}:`, err);
      setError(String(err));
    }
  }, [setCurrentMessages]); // <<< ADD setCurrentMessages dependency >>>

  // Function to load available model configurations
  const loadModels = async () => {
    console.log("Loading models...");
    setError(null);
    try {
      const models = await invoke<ModelConfig[]>('list_model_configs');
      console.log("Loaded models:", models);
      setAvailableModels(models);
      if (models.length === 0) {
          setError("No models configured. Please add one in Settings.");
      }
    } catch (err) {
      console.error('Error loading models:', err);
      setError(String(err));
    }
  };

  // Effect to load initial data (conversations and models)
  useEffect(() => {
    const loadInitialSettings = async () => {
        try {
            const value = await settingsStore.get<string | null>('utilityModelConfigId');
            if (value) {
                console.log('Loaded utility model ID:', value);
                setUtilityModelConfigId(value);
            } else {
                console.log('No utility model ID found in store.');
            }
        } catch (err: unknown) {
            console.error('Failed to load utility model setting:', err);
        }
    };

    loadModels(); 
    loadConversations(); 
    loadInitialSettings(); // Call async function to load settings

  }, []); // Run only once on mount

  // Effect to load messages when currentConversationId changes
  useEffect(() => {
    const conversationId = currentConversationId; // Capture ID for async use

    if (!conversationId) {
      console.log(`[loadMessages Effect] Skipping load because conversation ID is null.`);
      setCurrentMessages([]); // Clear messages if no conversation is selected
      return; // Exit early
    }

    // <<< Access streaming status and message ID for the target conversation >>>
    const isStreaming = streamingStatus[conversationId];
    const streamingMsgId = streamingMessagesRef.current[conversationId];

    console.log(`[loadMessages Effect] Handling ID: ${conversationId}, Streaming: ${isStreaming}, StreamingMsgID: ${streamingMsgId}`);

    const loadAndSetMessages = async () => {
      setError(null); // Clear previous errors
      try {
        console.log(`[loadMessages Effect] Fetching messages from DB for ${conversationId}...`);
        const dbMsgs = await invoke<Message[]>('get_conversation_messages', { conversationId });
        dbMsgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        console.log(`[loadMessages Effect] Fetched ${dbMsgs.length} messages from DB for ${conversationId}.`);

        if (isStreaming && streamingMsgId) {
          // Conversation is streaming, add placeholder if not in DB result
          const existingInDb = dbMsgs.some(msg => msg.id === streamingMsgId);
          if (!existingInDb) {
            console.log(`[loadMessages Effect] Streaming: Adding placeholder for ${streamingMsgId}`);
            // <<< Retrieve saved partial content >>>
            const savedPartialContent = partialContentRef.current[conversationId] ?? '';
            console.log(`[loadMessages Effect] Restoring partial content: "${savedPartialContent.substring(0,50)}..."`);
            const streamingPlaceholder: Message = {
              id: streamingMsgId,
              conversation_id: conversationId,
              role: 'assistant',
              content: savedPartialContent, // Use saved partial content
              timestamp: new Date().toISOString(), // Placeholder timestamp
            };
            setCurrentMessages([...dbMsgs, streamingPlaceholder]);
          } else {
            // Placeholder/Message already saved in DB (stream likely just finished)
            console.log(`[loadMessages Effect] Streaming: Message ${streamingMsgId} already exists in DB. Using DB state.`);
            setCurrentMessages(dbMsgs); // Use DB messages directly
          }
        } else {
          // Conversation is NOT streaming, just set DB messages
          console.log(`[loadMessages Effect] Not Streaming: Setting messages for ${conversationId} from DB.`);
          setCurrentMessages(dbMsgs);
        }
      } catch (err) {
        console.error(`[loadMessages Effect] Error loading messages for ${conversationId}:`, err);
        setError(String(err));
        setCurrentMessages([]); // Clear messages on error
      }
    };

    loadAndSetMessages();
    // <<< DEPENDENCIES: Include streamingStatus now >>>
  }, [currentConversationId, streamingStatus]);

  // <<< ADD Effect to handle conversation refresh trigger >>>
  useEffect(() => {
    if (needsConversationRefresh) {
      console.log("[Refresh Effect] needsConversationRefresh is true, calling loadConversations...");
      loadConversations();
      setNeedsConversationRefresh(false); // Reset trigger
    }
  }, [needsConversationRefresh, loadConversations]); // Depend on trigger and load function

  // RE-ADD handleNewConversation function
  const handleNewConversation = async () => {
    console.log("[Handler Ref] ENTERING handleNewConversation");
    setError(null);
    // setIsLoading(true); // <<< REMOVE STATE UPDATE >>>
    try {
      if (availableModels.length === 0) {
          setError("Cannot create chat: No models configured.");
      } else {
      const defaultModelId = availableModels[0].id;
          console.log(`[Handler Ref] Using default model ID: ${defaultModelId}`);
      const newConvo = await invoke<Conversation>('create_conversation', { modelConfigId: defaultModelId });
          console.log("[Handler Ref] Created new conversation:", newConvo);
          setConversations(prevConversations => 
              [newConvo, ...prevConversations]
                  .sort((a, b) => new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime())
          );
      setCurrentConversationId(newConvo.id);
          setCurrentInput(''); 
          navigate(`/chat/${newConvo.id}`); 
      }
    } catch (err: unknown) {
       if (err instanceof Error) {
         console.error('[Handler Ref] Error creating new conversation:', err.message);
         setError(err.message);
       } else {
         console.error('[Handler Ref] Error creating new conversation:', String(err));
      setError(String(err));
       }
    } finally {
      // setIsLoading(false); // <<< REMOVE STATE UPDATE >>>
      console.log("[Handler Ref] EXITING handleNewConversation");
    }
  };

  // Handle sending a message (Update Ref & State)
  const handleSendMessage = async () => {
    const conversationIdToSend = currentConversationIdRef.current;
    // Guards (unchanged)
    if (!currentInput.trim() || !conversationIdToSend) { /* ... */ return; }
    if (streamingStatus[conversationIdToSend]) { /* ... */ return; }
    
    const userMessageContent = currentInput;
    // <<< Restore userMessage object creation >>>
    const userMessage: Message = {
        id: `temp_user_${Date.now()}`,
        conversation_id: conversationIdToSend,
        role: 'user' as 'user',
        content: userMessageContent,
        timestamp: new Date().toISOString(),
    };
    const tempAssistantId = uuidv4(); 
    // <<< Restore assistantPlaceholder object creation >>>
    const assistantPlaceholder: Message = {
        id: tempAssistantId,
        conversation_id: conversationIdToSend,
        role: 'assistant' as 'assistant',
        content: '', 
        timestamp: new Date().toISOString(),
    };
    // <<< STORE temp ID in Ref >>>
    streamingMessagesRef.current[conversationIdToSend] = tempAssistantId;
    // <<< ADD Mapping for Temp ID >>>
    messageIdToConvoIdMapRef.current[tempAssistantId] = conversationIdToSend;

    setError(null);
    // <<< Clear Input Field >>>
    setCurrentInput('');

    try {
       // <<< REMOVE diagnostic logs >>>
       // console.log('[handleSendMessage] Logging messages BEFORE adding optimistic ones:');
       // currentMessages.forEach((m, idx) => console.log(`  [Before ${idx}]: ID=${m.id}, Role=${m.role}`));

       setCurrentMessages(prev => {
         // console.log(`[handleSendMessage] Inside setCurrentMessages. Prev count: ${prev.length}`);
         const newState = [...prev, userMessage, assistantPlaceholder];
         // console.log(`[handleSendMessage] Added optimistic messages. New count: ${newState.length}. TempAssistantID: ${tempAssistantId}`);
         return newState;
       });
       
       // <<< REMOVE diagnostic logs >>>
       // console.log('[handleSendMessage] Logging messages AFTER requesting optimistic update:');
       // currentMessages.forEach((m, idx) => console.log(`  [After Req ${idx}]: ID=${m.id}, Role=${m.role}`));
       
       // --- Set streaming STATE to true --- 
       setStreamingStatus(prev => ({ ...prev, [conversationIdToSend]: true }));

       // <<< Log arguments JUST before invoking >>>
       console.log(`[handleSendMessage] Invoking send_message with convoId: ${conversationIdToSend}, content: "${userMessageContent.substring(0, 50)}..."`);
       
       // Invoke backend
      await invoke('send_message', {
         conversationId: conversationIdToSend,
         content: userMessageContent
      });
      console.log("Message sent to backend.");

    } catch (err) {
      console.error('Error sending message or during setup:', err); 
      setError(String(err));
      setCurrentMessages(prev => prev.filter(m => m.id !== userMessage.id && m.id !== tempAssistantId));
      // --- Clear streaming REF & STATE on error --- 
      if (conversationIdToSend) {
          streamingMessagesRef.current[conversationIdToSend] = null; // Clear ref
          setStreamingStatus(prev => ({ ...prev, [conversationIdToSend]: false })); // Clear state
      }
    } 
  };

  // Handle Stopping Generation (Update Ref & State)
  const handleStopGeneration = async () => {
    const conversationIdToStop = currentConversationIdRef.current;
    if (!conversationIdToStop) { return; }

    // --- Get message ID from the REF --- 
    const messageIdToStop = streamingMessagesRef.current[conversationIdToStop];
    
    if (!messageIdToStop) {
        console.warn(`handleStopGeneration: Could not find streaming message ID in ref for convo ${conversationIdToStop}.`);
        return;
    }
    
    console.log(`handleStopGeneration: Requesting stop for message ID: ${messageIdToStop} in convo ${conversationIdToStop}.`); 

    // --- Clear streaming REF & STATE --- 
    streamingMessagesRef.current[conversationIdToStop] = null;
    setStreamingStatus(prev => ({ ...prev, [conversationIdToStop]: false }));
    console.log(`[handleStopGeneration] Cleared streaming ref & state for ${conversationIdToStop}.`);

    // Invoke backend stop signal
    try {
      await invoke('stop_generation', { messageId: messageIdToStop });
      console.log(`Stop signal sent for message ${messageIdToStop}`);
    } catch (err) {
      console.error('Error sending stop generation signal:', err);
      setError(`Failed to stop generation: ${String(err)}`);
      // Consider if we need to revert state/ref if stop signal fails?
    }
  };

  // Handle deleting a conversation
  const handleDeleteConversation = async (idToDelete: string) => {
      console.log(`Deleting conversation ${idToDelete}...`);
      setError(null);
      try {
          console.log(`[Frontend] Attempting invoke('delete_conversation', { conversationId: ${idToDelete} })`);
          await invoke('delete_conversation', { conversationId: idToDelete });
          console.log(`Conversation ${idToDelete} deleted.`);
          // Update state immediately
              const remainingConvos = conversations.filter(c => c.id !== idToDelete);
          setConversations(remainingConvos);
          
          // If the deleted one was selected, select the first remaining one or null
          if (currentConversationId === idToDelete) {
              if (remainingConvos.length > 0) {
                  const nextId = remainingConvos[0].id; // Already sorted
                  setCurrentConversationId(nextId);
                  navigate(`/chat/${nextId}`);
              } else {
                  setCurrentConversationId(null);
                  navigate('/'); // Navigate to base if no chats left
              }
          }
      } catch (err) {
          console.error('Error deleting conversation:', err);
          setError(String(err));
      }
  };

  // Handle changing the model for the current conversation
  const handleModelChange = async (newModelConfigId: string) => {
      if (!currentConversationId) return;
      console.log(`Changing model for ${currentConversationId} to ${newModelConfigId}`);
      setError(null);
      // Remove setIsLoading(true) / setIsLoading(false) here - loading is per-stream now
      try {
          await invoke('update_conversation_model', { 
              conversationId: currentConversationId,
              modelConfigId: newModelConfigId
          });
          // Update local state immediately
          setConversations(prev => 
              prev.map(c => 
                  c.id === currentConversationId ? { ...c, model_config_id: newModelConfigId } : c
              )
          );
          console.log("Conversation model updated.");
      } catch (err) {
          console.error('Error updating conversation model:', err);
          setError(String(err));
      }
  };

  // Handle refreshing models after changes in Settings
  const handleModelsChanged = async () => {
      await loadModels();
      await loadConversations(); // Reload convos in case a model used by one was deleted
  };

  // --- RE-ADD Rename Handlers ---
  const handleStartEditing = (conv: Conversation) => {
    setEditingConversationId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleCancelEditing = () => {
    setEditingConversationId(null);
    setEditingTitle('');
  };

  const handleSaveEditing = async (idToRename: string) => {
    const newTitle = editingTitle.trim();
    const originalConversation = conversations.find(c => c.id === idToRename);
    setEditingConversationId(null); // Exit editing mode immediately
    setEditingTitle('');

    if (!newTitle || !originalConversation || newTitle === originalConversation.title) {
        return; // Ignore empty titles or no change
    }

    // Optimistic update
    setConversations(prev => 
        prev.map(conv => 
            conv.id === idToRename ? { ...conv, title: newTitle } : conv
        )
    );

    try {
      console.log(`Invoking rename_conversation for ${idToRename} to "${newTitle}"...`);
      await invoke('rename_conversation', { 
        conversationId: idToRename, 
        newTitle: newTitle 
      });
      console.log('Renamed conversation on backend:', idToRename);
    } catch (err) {
      console.error('Error renaming conversation:', err);
      setError(String(err));
      // Revert optimistic update on error
      setConversations(prev => 
        prev.map(conv => 
            conv.id === idToRename ? { ...conv, title: originalConversation.title } : conv
        )
      );
    } 
  };

  // RE-ADD Handle Copying Message Content
  const handleCopy = async (id: string, content: string) => {
    console.log(`Attempting to copy message ${id}`);
    setError(null);
    try {
      await writeText(content);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500); // Reset icon after 1.5s
    } catch (err) {
      console.error('Failed to copy text:', err);
      setError(`Failed to copy: ${String(err)}`);
      setCopiedMessageId(null); // Ensure icon resets on error
    }
  };

  // RE-ADD Handle Regenerating Last Assistant Response (Placeholder)
  const handleRegenerate = async () => {
    console.warn("handleRegenerate needs to be updated for the queue-based streaming logic.");
    setError("Regenerate function not yet updated.");
  };

  // <<< REPLACE Listener Setup Effect - Remove loadMessages from dependencies >>>
  useEffect(() => {
    console.log("[Effect Listener Setup] Setting up stream listeners...");
    // Set up event listeners for streaming events
    const setupStreamListeners = async () => {
      try {
        // Listen for stream started events
        console.log("[Effect Listener Setup] Registering assistant_stream_started...");
        const unlisten1 = await listen<AssistantStreamStarted>('assistant_stream_started', event => {
          const { conversationId, messageId } = event.payload;
          console.log(`[Listener Callback - Started] Stream started: convoId=${conversationId}, msgId=${messageId}`);

          // Update mapping from message ID to conversation ID
          messageIdToConvoIdMapRef.current[messageId] = conversationId;

          // <<< Initialize partial content store for this stream >>>
          partialContentRef.current[conversationId] = '';

          // Update streaming status
          setStreamingStatus(prev => ({ ...prev, [conversationId]: true }));

          // Store streaming message ID (The REAL one from backend)
          streamingMessagesRef.current[conversationId] = messageId;

          // --- Swap Temp ID with Real ID in state ---
          // Find temp ID based on convo ID (MUST exist if started event is received after handleSendMessage)
          const tempAssistantId = Object.keys(messageIdToConvoIdMapRef.current).find(key =>
             messageIdToConvoIdMapRef.current[key] === conversationId && key !== messageId
          );
          // ^^^ This logic to find temp ID might be brittle, relies on map state.
          // Consider refining how temp ID is passed or retrieved if issues arise.

          if (tempAssistantId && conversationId === currentConversationIdRef.current) {
              console.log(`[Listener Callback - Started] Swapping temp ID ${tempAssistantId} with real ID ${messageId} in UI state.`);
              setCurrentMessages(prevMessages => prevMessages.map(msg =>
                 msg.id === tempAssistantId ? { ...msg, id: messageId } : msg
              ));
              // Remove the temp ID mapping once swapped
              delete messageIdToConvoIdMapRef.current[tempAssistantId];
          } else if (tempAssistantId) {
              console.log(`[Listener Callback - Started] Real ID ${messageId} received for background convo ${conversationId}. State update skipped, temp mapping removed.`);
              // Remove the temp ID mapping even if not visible
              delete messageIdToConvoIdMapRef.current[tempAssistantId];
          } else {
              console.warn(`[Listener Callback - Started] Could not find temp ID in map for convo ${conversationId} when started event received for ${messageId}`);
          }
        });

        // Listen for message chunks
        console.log("[Effect Listener Setup] Registering assistant_message_chunk...");
        const unlisten2 = await listen<AssistantMessageChunk>('assistant_message_chunk', event => {
            // Use the existing direct update logic (no queue)
            const { messageId, delta } = event.payload;
            const chunkConversationId = messageIdToConvoIdMapRef.current[messageId];
            
            // <<< ALWAYS update partial content ref >>>
            if (chunkConversationId && delta) {
              partialContentRef.current[chunkConversationId] = 
                (partialContentRef.current[chunkConversationId] || '') + delta;
            }

            // <<< Update UI state ONLY if the conversation is currently viewed >>>
            if (chunkConversationId && chunkConversationId === currentConversationIdRef.current) {
                setCurrentMessages(prevMessages =>
                prevMessages.map(msg =>
                    msg.id === messageId
                    ? { ...msg, content: msg.content + delta }
                    : msg
                )
                );
            }
        });

        // Listen for stream finished events
        console.log("[Effect Listener Setup] Registering assistant_stream_finished...");
        const unlisten3 = await listen<AssistantStreamFinished>('assistant_stream_finished', async (event) => { // <<< Make callback async
          const { messageId } = event.payload;
          const conversationId = messageIdToConvoIdMapRef.current[messageId];

          console.log(`[Listener Callback - Finished] Stream finished: msgId=${messageId}, convoId=${conversationId}`);

          if (conversationId) {
            // Clear streaming status first
            setStreamingStatus(prev => ({ ...prev, [conversationId]: false }));
            streamingMessagesRef.current[conversationId] = null;
            console.log(`[Listener Callback - Finished] Cleared streaming state for ${conversationId}`);

            // <<< Check Title Generation based on FRESH data >>>
            const currentUtilModelId = utilityModelConfigIdRef.current; // Get util model ID
            try {
                console.log(`[Listener Callback - Finished] Fetching latest conversations before title check for ${conversationId}...`)
                // --- Fetch the specific conversation that just finished ---
                // Note: This assumes storage.get_conversation exists and is exposed.
                // If not, fetching all is a fallback, but less efficient.
                // Let's stick to fetching all for now as it's already implemented.
                const latestConversations = await invoke<Conversation[]>('list_conversations');
                const currentConvo = latestConversations.find(c => c.id === conversationId);

                if (currentConvo && currentConvo.title === "New Chat" && currentUtilModelId) {
                   console.log(`[Listener Callback - Finished] Triggering title generation for ${conversationId}`);

                   // <<< Use async/await for invoke >>>
                   try {
                       await invoke('generate_conversation_title', {
                           conversationId: conversationId,
                           utilityModelConfigId: currentUtilModelId
                       });
                       console.log(`[Listener Callback - Finished] Title generation invoke SUCCEEDED for ${conversationId}.`);
                       // <<< REMOVE EXPLICIT REFRESH VIA setTimeout >>>
                       /*
                       setTimeout(async () => {
                           try {
                             console.log(`[Listener Callback - Finished] Delay finished, explicitly fetching conversations...`);
                             const refreshedConvos = await invoke<Conversation[]>('list_conversations');
                             // Sort convos again after fetching
                             refreshedConvos.sort((a, b) =>
                               new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime()
                             );
                             setConversations(refreshedConvos);
                             console.log(`[Listener Callback - Finished] Explicitly set ${refreshedConvos.length} conversations after title generation.`);
                           } catch (refreshErr) {
                             console.error(`[Listener Callback - Finished] Error explicitly refreshing conversations:`, refreshErr);
                           }
                       }, 300); // 300ms delay
                       */
                   } catch (err) {
                       console.error(`[Listener Callback - Finished] Title generation invoke FAILED for ${conversationId}:`, err);
                   }
                } else {
                     console.log(`[Listener Callback - Finished] Conditions not met for title generation (Fetched Title: ${currentConvo?.title}, UtilModel: ${currentUtilModelId})`);
                }
            } catch (listErr) {
                console.error(`[Listener Callback - Finished] Error fetching conversations for title check:`, listErr);
            }
            // <<< End Title Check Logic >>>

            // Reload messages ONLY if the finished stream belongs to the currently viewed conversation
            if (conversationId === currentConversationIdRef.current) {
              console.log(`[Listener Callback - Finished] Reloading messages for current convo ${conversationId}`);
              loadMessages(conversationId);
            } else {
               console.log(`[Listener Callback - Finished] Stream finished for background convo ${conversationId}. No message reload needed.`);
            }

            // Clean up reference mapping (only the real ID should remain at this point)
            delete messageIdToConvoIdMapRef.current[messageId];
            console.log(`[Listener Callback - Finished] Cleaned up map ref for message ${messageId}`);

            // <<< Clean up partial content store >>>
            if (partialContentRef.current.hasOwnProperty(conversationId)) {
              delete partialContentRef.current[conversationId];
              console.log(`[Listener Callback - Finished] Cleaned up partial content ref for convo ${conversationId}`);
            }

          } else { // Case where conversationId couldn't be found from messageId
             console.warn(`[Listener Callback - Finished] No conversation ID found in map ref for finished message ${messageId}.`);
          }
        });

        // <<< ADD Listener for conversation updates (e.g., title changes) >>>
        console.log("[Effect Listener Setup] Registering conversation_updated...");
        const unlisten4 = await listen<{ conversationId: string }>('conversation_updated', async (event) => {
            const { conversationId } = event.payload;
            console.log(`[Listener Callback - Updated] Received update for conversation: ${conversationId}. Refreshing list.`);
            // Reload the entire conversation list to reflect changes like the new title
            await loadConversations(); // Use the existing loadConversations function
        });

        // Store cleanup functions
        unlistenStartedRef.current = unlisten1;
        unlistenChunkRef.current = unlisten2;
        unlistenFinishedRef.current = unlisten3;
        unlistenUpdatedRef.current = unlisten4; // Store the new cleanup function
        console.log("[Effect Listener Setup] Listeners registered.");
      } catch (error) {
        console.error("[Effect Listener Setup] Failed to setup listeners:", error);
        setError("Failed to connect to backend streaming events.");
      }
    };

    setupStreamListeners();

    // Cleanup listeners on unmount
    return () => {
      console.log("[Effect Listener Cleanup] Cleaning up stream listeners...");
      if (unlistenStartedRef.current) unlistenStartedRef.current();
      if (unlistenChunkRef.current) unlistenChunkRef.current();
      if (unlistenFinishedRef.current) unlistenFinishedRef.current();
      if (unlistenUpdatedRef.current) unlistenUpdatedRef.current(); // Clean up the new listener
      unlistenStartedRef.current = null;
      unlistenChunkRef.current = null;
      unlistenFinishedRef.current = null;
      unlistenUpdatedRef.current = null; // Clear the new ref
      console.log("[Effect Listener Cleanup] Listeners cleaned up.");
    };
  }, [/* loadMessages removed */ setConversations, loadConversations]); // <<< REMOVED loadMessages dependency >>>

  return (
    <div className="relative flex h-screen bg-background text-foreground"> {/* Removed pt-10 */}
      {/* Mock macOS buttons for inactive state */} 
      <div className="absolute top-2 left-2 flex space-x-2 z-0"> {/* Container for mocks */} 
        <div className="h-3 w-3 rounded-full bg-red-500"></div>
        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
        <div className="h-3 w-3 rounded-full bg-green-500"></div>
      </div>

      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col flex-shrink-0">
        {/* Top Section: New Chat Button - Use p-3 for height consistency */}
        <div data-tauri-drag-region> {/* Apply drag region to outer wrapper */} 
          <div className="p-3 border-b border-border flex justify-end"> {/* Inner container for padding/layout */} 
            <Button variant="outline" size="icon" onClick={handleNewConversation} title="New Chat"> {/* Use size=icon and add title */} 
              <Plus className="h-4 w-4" /> {/* Removed mr-2 */} 
          </Button>
          </div>
        </div>

        {/* Middle Section: Conversation List - Use ScrollArea */}
        <ScrollArea 
          className="flex-grow px-2 space-y-1"
        >
          {conversations.map(conv => (
            <Link
              key={conv.id}
              to={`/chat/${conv.id}`}
              onClick={() => setCurrentConversationId(conv.id)}
              className={cn(
                "group flex items-center px-2 py-2 rounded-md text-sm font-medium h-9 w-[97%]",
                currentConversationId === conv.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                editingConversationId === conv.id ? "bg-muted" : ""
              )}
              onDoubleClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  handleStartEditing(conv);
              }}
            >
              {editingConversationId === conv.id ? (
                 <input 
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleSaveEditing(conv.id)} // Save on blur
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEditing(conv.id);
                    if (e.key === 'Escape') handleCancelEditing();
                  }}
                    className="flex-grow bg-transparent rounded-sm px-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus // Focus the input when it appears
                />
              ) : (
                  <span className="truncate flex-grow">{conv.title || `Chat ${conv.id.substring(0, 4)}`}</span>
              )}

               {/* Action buttons (Delete) - Only show when not editing */}
              {editingConversationId !== conv.id && currentConversationId === conv.id && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                   <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={(e) => { e.preventDefault(); handleDeleteConversation(conv.id); }} title="Delete">
                        <Trash2 className="h-3 w-3" /> 
                  </Button>
                </div>
              )}
            </Link>
          ))}
        </ScrollArea>

        {/* Bottom Section: Settings Link */}
        <div className="p-3 border-t border-border">
          <Link to="/settings">
            <Button
                variant={location.pathname === '/settings' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
            >
              <Settings className="mr-2 h-4 w-4" /> settings {/* Lowercase */}
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content area - Use main tag, apply pattern from guide */} 
      <main className="flex flex-col flex-grow min-w-0 min-h-0">
        {/* Error Display & REMOVE Temporary Counter Display */} 
        {error && (
          <div className="p-4 bg-red-100 text-red-700 border-b border-red-200 flex-shrink-0 z-10">
            Error: {error} <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
           </div>
        )}
        {/* <div className="p-1 text-xs text-muted-foreground">Chunk Counter: {chunkRenderCounter}</div> */}

        {/* The single scroll container for routed content */} 
        <div className="flex-grow overflow-y-auto min-h-0">
        <Routes>
                <Route path="/chat/:conversationId" element={
                    currentConversationId && availableModels.length > 0 ? (
              <ChatArea 
                currentMessages={currentMessages} 
                currentInput={currentInput} 
                setCurrentInput={setCurrentInput} 
                handleSendMessage={handleSendMessage} 
                currentConversation={currentConversation}
                availableModels={availableModels}
                handleModelChange={handleModelChange}
                            handleStopGeneration={handleStopGeneration}
                            handleCopy={handleCopy}
                            handleRegenerate={handleRegenerate}
                            copiedMessageId={copiedMessageId}
                            isLoading={!!streamingStatus[currentConversation?.id ?? '']}
                            streamingMessageId={streamingMessagesRef.current[currentConversation?.id ?? '']}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground p-6">
                  Select a conversation or start a new one.
              </div>
                    )
                } />
                <Route path="/settings" element={
                    <SettingsPage 
                        onModelsChanged={handleModelsChanged} 
                availableModels={availableModels}
                        utilityModelConfigId={utilityModelConfigId}
                        setUtilityModelConfigId={setUtilityModelConfigId}
             />
          } />
                <Route path="*" element={
                    <div className="flex h-full items-center justify-center text-muted-foreground p-6">
                        {conversations.length > 0 ? "Invalid route." : "No conversations found."}
                    </div>
                } />
        </Routes>
      </div>
      </main>
    </div>
  );
}

export default App;
