import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'; // Import router components and useNavigate
// Use Tauri v2 standard import paths
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { confirm } from '@tauri-apps/plugin-dialog';
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
import { Plus, Settings, Trash2, SendHorizonal, Pencil, ClipboardCopy, Check } from "lucide-react"; 
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
import { Square, Edit2, X, Loader2, RefreshCw, CircleHelp } from "lucide-react";
import { v4 as uuidv4 } from 'uuid'; // For generating temporary IDs
import { Components } from 'react-markdown'; // Import Components type
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'; // Use plugin-specific path

// Import Select types explicitly
import type { 
  SelectProps, 
  SelectContentProps, 
  SelectItemProps, 
  SelectTriggerProps, 
  SelectValueProps 
} from "@radix-ui/react-select";

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
}

// Settings Page Component accepting props
const SettingsPage = ({ onModelsChanged }: SettingsPageProps) => {
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

  // Fetch model configs on mount
  useEffect(() => {
    async function loadModelConfigs() {
      setIsLoading(true);
      setError(null);
      try {
        console.log('Invoking list_model_configs...');
        const fetchedConfigs = await invoke<ModelConfig[]>('list_model_configs');
        console.log('Fetched model configs:', fetchedConfigs);
        setModelConfigs(fetchedConfigs);
      } catch (err) {
        console.error('Error fetching model configs:', err);
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    }
    loadModelConfigs();
  }, []);

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
        setError("Cannot delete the configuration while editing it. Please cancel editing first.");
        return;
    }

    console.log(`handleDeleteModelConfig called for ID: ${idToDelete}`);
    const confirmed = await confirm('Are you sure you want to delete this model configuration?', {
         title: 'Confirm Deletion'
     });
    if (!confirmed) return;

    setError(null);
    setIsLoading(true);
    try {
        console.log(`Invoking delete_model_config for ${idToDelete}...`);
        await invoke('delete_model_config', { configId: idToDelete });
        console.log('Deleted model config');
        const updatedConfigs = modelConfigs.filter(mc => mc.id !== idToDelete)
        setModelConfigs(updatedConfigs);
        await onModelsChanged(); // Refresh models in parent
    } catch (err) {
        console.error('Error deleting model config:', err);
        setError(String(err));
    } finally {
        setIsLoading(false);
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
      <h1 className="text-2xl font-semibold mb-6">Settings</h1> {/* REMOVED flex-shrink-0 */} 

      {error && (
        <div className="text-red-600 bg-red-100 p-3 rounded-md mb-6"> {/* REMOVED flex-shrink-0 */} 
          Error: {error}
        </div>
      )}

      {/* Original Content wrapper - NO LONGER needs ScrollArea */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Model Configurations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && !editingConfigId && <p>Loading configurations...</p>} {/* Hide loading text when editing */}
            {!isLoading && modelConfigs.length === 0 && <p>No configurations found.</p>}
            {modelConfigs.map(config => (
              <Card key={config.id} className="p-4 flex justify-between items-center">
                <div className="space-y-1 flex-grow min-w-0 mr-4">
                  <div className="font-medium break-words">{config.name}</div>
                  <div className="text-sm text-muted-foreground break-words">Model: {getModelNameFromOptions(config.provider_options)}</div>
                  <div className="text-sm text-muted-foreground break-words">URL: {config.api_url}</div>
                  <div className="text-sm text-muted-foreground break-words">Key Ref: {config.api_key_ref || 'N/A'}</div>
                </div>
                {/* Buttons Container */}
                <div className="flex flex-col space-y-1 items-end flex-shrink-0">
                   <Button
                      size="sm"
                      onClick={() => handleStartEditing(config)}
                      disabled={isLoading || !!editingConfigId} // Disable if loading or already editing another
                      className="w-24 justify-start" // Fixed width and align text
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteModelConfig(config.id)}
                      disabled={isLoading || !!editingConfigId} // Disable if loading or editing
                      className="w-24 justify-start" // Fixed width and align text
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
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
              <CardTitle>{editingConfigId ? 'Edit Model Configuration' : 'Add New Model'}</CardTitle>
            </CardHeader>
            {/* Use the unified save handler */}
            <form onSubmit={handleSaveModelConfig}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="formName">Name</Label>
                  {/* Use form state variables */}
                  <Input id="formName" value={formName} onChange={e => setFormName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="formApiUrl">API URL</Label>
                  <Input id="formApiUrl" type="url" value={formApiUrl} onChange={e => setFormApiUrl(e.target.value)} required placeholder="e.g., https://api.openai.com/v1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="formApiKeyRef">API Key Ref</Label>
                  <Input id="formApiKeyRef" value={formApiKeyRef} onChange={e => setFormApiKeyRef(e.target.value)} placeholder="e.g., env:MY_KEY or keyring" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="formModelName">Model ID</Label>
                  <Input id="formModelName" value={formModelName} onChange={e => setFormModelName(e.target.value)} required placeholder="e.g., gpt-4o-mini" />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between"> {/* Use flex justify-between */}
                {/* Dynamic Submit Button Text */}
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (editingConfigId ? 'Updating...' : 'Adding...') : (editingConfigId ? 'Update Configuration' : 'Add Configuration')}
                </Button>
                {/* Cancel Button (only shown when editing) */}
                {editingConfigId && (
                  <Button type="button" variant="outline" onClick={handleCancelEditing} disabled={isLoading}>
                    Cancel
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
  isStreaming,
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
  isStreaming: boolean,
  handleStopGeneration: () => Promise<void>,
  handleCopy: (id: string, content: string) => Promise<void>,
  handleRegenerate: () => Promise<void>,
  copiedMessageId: string | null,
  isLoading: boolean,
  streamingMessageId: string | null,
}) => {
  console.log('ChatArea received:', { isStreaming, streamingMessageId });
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

    // Custom code renderer (conditionally simplified)
    code({ node, className, children, style, ...rest }) {
      const isCurrentlyStreaming = isStreaming; // Simplified check: render basic if *anything* is streaming

      if (isCurrentlyStreaming) {
        // Simple rendering during stream
        return <code {...rest} className={className}>{children}</code>;
      }
      
      // Full rendering after stream (or if not streaming) - Revert to rehypeHighlight logic
      const match = /language-(\w+)/.exec(className || '');
      if (match && match[1] === 'mermaid') {
         return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
      }

      // Let rehypeHighlight handle classes for code blocks and inline code
      // Apply overflow only if it's likely a block (has language class)
      const finalClassName = match ? cn(className, "overflow-x-auto w-full") : className;
      return (
        <code {...rest} className={finalClassName}>
          {children}
        </code>
      );
    },

    // Custom pre renderer (conditionally simplified) - Revert logic
    pre: ({ node, children, className: initialClassName, ...props }: any) => {
      const isCurrentlyStreaming = isStreaming; // Simplified check

      if (isCurrentlyStreaming) {
        // Simple rendering during stream
        return <pre {...props} className={cn(initialClassName, "block overflow-x-auto w-full")}>{children}</pre>;
      }

      // Full rendering after stream (or if not streaming)
      // Use logic similar to before, relying on rehypeHighlight structure
      let isCodeBlock = false;
      if (React.isValidElement(children) && children.type === 'code') {
        if (React.isValidElement(children) && (children as React.ReactElement).type === 'code') {
          isCodeBlock = true;
        }
      }
      // Add back relative positioning needed for action buttons
      const finalClassName = isCodeBlock 
        ? cn(initialClassName, "block overflow-x-auto w-full relative") 
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
        className="flex-grow px-6 pb-0 space-y-4 min-h-0"
      >
        <div className="h-4 flex-shrink-0"></div> {/* Top spacer */} 
        {currentMessages.map((msg, index) => {
          const displayContent = msg.content; 

          return (
           <div 
             key={msg.id || index} 
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
              <div className="prose dark:prose-invert prose-sm \
                               break-words \
                               prose-p:m-0 prose-pre:m-2 prose-pre:p-0 prose-pre:bg-transparent \
                               prose-table:block prose-table:max-w-none prose-table:overflow-x-auto prose-table:min-w-full">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]} // Add rehypeHighlight back
                    components={markdownComponents} // Use statically defined components
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
                    disabled={isLoading || isStreaming} // Disable if loading/streaming
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
        {isStreaming ? (
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
              placeholder="Type your message..."
              className="relative z-10 flex-grow resize-none bg-secondary border-0 rounded-md p-3 focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent shadow-[0px_0px_20px_20px_rgba(255,255,255,1.0)]"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isStreaming} // Also disable textarea just in case
            />
          </form>
        )}
      </div>
    </div>
  );
};

// Define the structure of the chunk payload from backend
interface AssistantMessageChunk {
  conversationId: string;
  messageId: string; // The ID of the message being streamed
  delta: string; // The content chunk
  isFirstChunk: boolean;
}

// Define the structure for the NEW stream finished event
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation(); // Get current location
  const navigate = useNavigate(); // For navigation
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // State for streaming status
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Refs for debouncing the message update
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedContentRef = useRef<string>(''); // Stores full content for the current streaming message

  // --- Debounced function to update React state (defined outside useEffect) ---
  const updateMessagesDebounced = useCallback(() => {
      // No need to read streamingMessageId here, use the one captured in the closure
      // when the timer was set, or rely on the check within the listener
      setCurrentMessages(prevMessages =>
          prevMessages.map(msg =>
              msg.id === streamingMessageId // Use the state variable holding the ID
                  ? { ...msg, content: accumulatedContentRef.current } // Update with latest accumulated content
                  : msg
          )
      );
  }, [setCurrentMessages, streamingMessageId]); // Dependencies: only need setter + the ID used inside

  // Helper to find the full Conversation object
  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // Helper to find the full ModelConfig object
  const currentModelConfig = availableModels.find(m => m.id === currentConversation?.model_config_id);

  // Function to load all conversations
  const loadConversations = async () => {
    console.log("Loading conversations...");
    setError(null);
    try {
      const convos = await invoke<Conversation[]>('list_conversations');
      console.log("Loaded conversations:", convos);
      // Sort by last_updated_at descending (most recent first)
      convos.sort((a, b) => new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime());
      setConversations(convos);
      // If no conversation is selected, or selected doesn't exist, select the first one
      if ((!currentConversationId || !convos.find(c => c.id === currentConversationId)) && convos.length > 0) {
        const firstConvoId = convos[0].id;
        setCurrentConversationId(firstConvoId);
        navigate(`/chat/${firstConvoId}`, { replace: true }); // Navigate to the first convo
        console.log(`Automatically selected first conversation: ${firstConvoId}`);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
      setError(String(err));
    }
  };

  // Function to load messages for a specific conversation
  const loadMessages = async (conversationId: string | null) => {
    if (!conversationId) {
      setCurrentMessages([]);
      return;
    }
    console.log(`Loading messages for conversation ${conversationId}...`);
    setError(null);
    try {
      const msgs = await invoke<Message[]>('get_conversation_messages', { conversationId });
      msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setCurrentMessages(msgs);
    } catch (err) {
      console.error(`Error loading messages for ${conversationId}:`, err);
      setError(String(err));
    }
  };

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
    loadModels(); 
    loadConversations(); 
  }, []); // Run only once on mount

  // Listen for STREAMING chunks from the backend
  useEffect(() => {
    let unlistenChunkFn: (() => void) | null = null;

    async function setupChunkListener() {
      try {
        unlistenChunkFn = await listen<AssistantMessageChunk>('assistant_message_chunk', (event) => {
          const { conversationId, messageId, delta, isFirstChunk } = event.payload;

          // --- Check if related to current convo --- 
          if (conversationId !== currentConversationId) {
              return; // Ignore chunks for other convos
          }
          
          if (isFirstChunk) {
             // --- Update streaming state and prepare placeholder on first chunk ---
             // Use functional update to safely check/set isStreaming
             setIsStreaming(prevIsStreaming => {
                 console.log(`>>> Listener: First chunk for ${messageId}. Setting isStreaming=true.`); 
                 if (!prevIsStreaming) {
                     setStreamingMessageId(messageId); // Store the ID of the message we're streaming
                     accumulatedContentRef.current = delta; // Initialize accumulator
                     // Add placeholder message immediately (no debounce needed for this)
                     setCurrentMessages(prevMessages => [
                         ...prevMessages,
                         {
                             id: messageId, 
                             conversation_id: conversationId,
                             role: 'assistant' as 'assistant',
                             content: delta, // Initial content
                             timestamp: new Date().toISOString(),
                             metadata: undefined,
                         }
                     ]);
                     return true;
                 }
                 return prevIsStreaming; // Already streaming, no change
             });

          } else {
             // --- Accumulate content and debounce state update for subsequent chunks ---
             // Use functional update to get latest streamingMessageId for comparison
             setStreamingMessageId(currentStreamingId => {
                 if (messageId !== currentStreamingId) {
                     console.log(`Chunk for ${messageId} ignored, current stream is ${currentStreamingId}`);
                     return currentStreamingId; // Ignore chunk if not for current stream
                 }

                 accumulatedContentRef.current += delta; // Append to accumulator

                 // Clear existing timer if present
                 if (debounceTimerRef.current) {
                     clearTimeout(debounceTimerRef.current);
                 }

                 // Set a new timer - Capture current value of accumulator
                 const currentAccumulated = accumulatedContentRef.current;
                 debounceTimerRef.current = setTimeout(() => {
                     // Update using the captured value when timer fires
                     setCurrentMessages(prevMessages =>
                       prevMessages.map(msg =>
                           msg.id === currentStreamingId // Use the ID from state closure
                               ? { ...msg, content: currentAccumulated } // Update with captured accumulated content
                               : msg
                       )
                     );
                     debounceTimerRef.current = null; // Clear timer ID
                 }, 100); // Debounce interval (100ms)

                 return currentStreamingId; // Keep the ID
             });
          }
        });
      } catch (e) {
        console.error("Failed to set up assistant message chunk listener:", e);
        setError("Failed to connect for assistant responses.");
      }
    }

    setupChunkListener();

    // Cleanup listener and debounce timer on unmount
    return () => {
      console.log('Cleaning up assistant chunk listener and debounce timer');
      if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
      }
      accumulatedContentRef.current = ''; // Reset accumulator
      if (unlistenChunkFn) {
        unlistenChunkFn();
      }
    };
  }, [currentConversationId, isStreaming, setCurrentMessages, setStreamingMessageId]); // Adjusted dependencies

  // <<< Listen for stream FINISHED event from backend >>>
  useEffect(() => {
    let unlistenFinishedFn: (() => void) | null = null;

    // Define the final update logic here, separate from the debounced one used during streaming
    const performFinalUpdate = (targetMessageId: string) => {
      setCurrentMessages(prevMessages =>
          prevMessages.map(msg =>
              msg.id === targetMessageId 
                  ? { ...msg, content: accumulatedContentRef.current } // Use final accumulated content
                  : msg
          )
      );
    };

    async function setupFinishedListener() {
      try {
        unlistenFinishedFn = await listen<AssistantStreamFinished>('assistant_stream_finished', (event) => {
          const { messageId } = event.payload;

          // Need latest streamingMessageId for comparison & cleanup
          setStreamingMessageId(currentId => {
            if (messageId === currentId) {
              console.log(`>>> Finished Listener: Matched streamingMessageId (${currentId}). Resetting state.`);
              
              // --- Final Update (Ensure last chunk is rendered) --- 
              // Clear any pending debounce timer for this message 
              if (debounceTimerRef.current) { 
                  clearTimeout(debounceTimerRef.current); 
                  debounceTimerRef.current = null; 
              } 
              // Perform one final state update immediately after stream finishes 
              performFinalUpdate(currentId); // Use the ID we know matched
              accumulatedContentRef.current = ''; // Reset accumulator
              
              setIsStreaming(false);
              console.log(`>>> Finished Listener: State AFTER setIsStreaming(false): isStreaming=false (expected)`);
              return null; // Reset the ID
            } else {
              console.log(`>>> Finished Listener: Mismatched ID (current: ${currentId}, received: ${messageId}). No state change.`);
              return currentId; // Keep current ID if no match
            }
          });
        });
      } catch (e) {
        console.error("Failed to set up assistant finished listener:", e);
        // Optionally set an error state here
      }
    }

    setupFinishedListener();

    // Cleanup listener on unmount
    return () => {
      console.log('Cleaning up assistant finished listener');
      if (unlistenFinishedFn) {
        unlistenFinishedFn();
      }
    };
  }, [streamingMessageId, setCurrentMessages, setStreamingMessageId]); // Added dependencies needed by performFinalUpdate closure

  // Handle creating a new conversation
  const handleNewConversation = useCallback(async () => {
    console.log("Creating new conversation...");
    setError(null);
    setIsLoading(true);
    try {
      // Use the first available model, or handle error if none exist
      if (availableModels.length === 0) {
          setError("Cannot create chat: No models configured.");
          setIsLoading(false);
          return;
      }
      const defaultModelId = availableModels[0].id;
      console.log(`Using default model ID: ${defaultModelId}`);
      const newConvo = await invoke<Conversation>('create_conversation', { modelConfigId: defaultModelId });
      console.log("Created new conversation:", newConvo);
      // Add to list, select it, and navigate
      const updatedConversations = [newConvo, ...conversations]
          .sort((a, b) => new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime());
      setConversations(updatedConversations);
      setCurrentConversationId(newConvo.id);
      setCurrentInput(''); // Clear input for new chat
      navigate(`/chat/${newConvo.id}`); // Navigate to the new chat route
    } catch (err) {
      console.error('Error creating new conversation:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [availableModels, conversations, navigate, setError, setIsLoading, setCurrentConversationId, setCurrentInput]); // Dependencies for useCallback

  // Handle sending a message
  const handleSendMessage = async () => {
    // Log the guard condition check AND the state value
    console.log(`handleSendMessage: Checking guard. Current isStreaming=${isStreaming}`); // ADDED LOG
    console.log('handleSendMessage Guard Check:', {
        canSubmit: !(!currentInput.trim() || !currentConversationId || isLoading || isStreaming),
        inputOk: !!currentInput.trim(),
        convoIdOk: !!currentConversationId,
        isLoading: isLoading,
        isStreaming: isStreaming,
    });
    if (!currentInput.trim() || !currentConversationId || isLoading || isStreaming) {
        console.log(`handleSendMessage blocked: isStreaming=${isStreaming}, isLoading=${isLoading}`); // Enhanced log
        return;
    }
    console.log(`Sending message to ${currentConversationId}...`);
    setError(null);
    setIsLoading(true);
    const userMessageContent = currentInput;
    setCurrentInput(''); // Clear input immediately

    // Define temp message here so it's in scope for the catch block
    const tempUserMessage: Message = {
        id: `temp_${Date.now()}`,
        conversation_id: currentConversationId,
        role: 'user' as 'user',
        content: userMessageContent,
        timestamp: new Date().toISOString(),
    };

    try {
      // Add user message optimistically
       setCurrentMessages(prev => [...prev, tempUserMessage]);

      // Invoke backend to send message and get response
      await invoke('send_message', {
        conversationId: currentConversationId,
        content: userMessageContent,
      });
      console.log("Message sent to backend.");
      // Response will arrive via the 'chat_update' event listener
      // Reload conversations to update the sort order (last_updated_at)
      await loadConversations(); 

    } catch (err) {
      console.error('Error sending message:', err);
      setError(String(err));
      // Remove optimistic message if sending failed
      setCurrentMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));
    } finally {
      setIsLoading(false);
      // Don't set isStreaming here, wait for first chunk event
    }
  };

  // Handle Stopping Generation
  const handleStopGeneration = async () => {
    // Capture state *before* potentially changing it
    const streamingBefore = isStreaming;
    const streamIdBefore = streamingMessageId;
    
    if (!streamingBefore || !streamIdBefore) return;
    console.log(`handleStopGeneration: Called. isStreaming=${streamingBefore}, id=${streamIdBefore}. Resetting state.`); // ADDED LOG
    const messageIdToStop = streamIdBefore;
    const currentConvoId = currentConversationId;

    // Reset streaming state immediately
    setIsStreaming(false);
    console.log(`handleStopGeneration: State AFTER setIsStreaming(false): isStreaming=false (expected)`); // ADDED LOG
    setStreamingMessageId(null);

    // Invoke backend stop signal
    try {
      await invoke('stop_generation', { messageId: messageIdToStop });
      console.log(`Stop signal sent for message ${messageIdToStop}`);
    } catch (err) {
      console.error('Error sending stop generation signal:', err);
      setError(`Failed to stop generation: ${String(err)}`);
      // Optionally revert UI state if needed, but usually stopping is final
    }
  };

  // Handle deleting a conversation
  const handleDeleteConversation = async (idToDelete: string) => {
      console.log(`Deleting conversation ${idToDelete}...`);
      setError(null);
      try {
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
      setIsLoading(true);
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
      } finally {
          setIsLoading(false);
      }
  };

  // Handle refreshing models after changes in Settings
  const handleModelsChanged = async () => {
      await loadModels();
      await loadConversations(); // Reload convos in case a model used by one was deleted
  };

  // --- Rename Handlers ---
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
      // Refetch might be needed if backend fails, or handle error specifically
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
  // --- End Rename Handlers ---

  // Handle Copying Message Content (Clipboard API import commented out for now)
  const handleCopy = async (id: string, content: string) => {
    console.log(`Attempting to copy message ${id}`);
    setError(null);
    try {
      await writeText(content); // Uncommented clipboard call
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500); // Reset icon after 1.5s
    } catch (err) {
      console.error('Failed to copy text:', err);
      setError(`Failed to copy: ${String(err)}`);
      setCopiedMessageId(null); // Ensure icon resets on error
    }
  };

  // Handle Regenerating Last Assistant Response (Requires backend command)
  const handleRegenerate = async () => {
      if (!currentConversationId) return;
      console.log(`Regenerating last response for conversation ${currentConversationId}...`);
      setError(null);
      setIsLoading(true); // Use main loading state for now

      // Optimistically remove the last assistant message from UI
      let removedMessageId: string | null = null;
      setCurrentMessages(prevMessages => {
        if (prevMessages.length === 0) return prevMessages;
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          removedMessageId = lastMessage.id; // Store ID for potential rollback
          console.log(`Optimistically removing assistant message ${removedMessageId}`);
          return prevMessages.slice(0, -1); // Return array without the last message
        } else {
          console.warn("Regenerate called but last message is not from assistant.");
          return prevMessages; // No change if last message isn't assistant
        }
      });

      try {
        // Assumes backend has a command 'regenerate_last_response'
        await invoke('regenerate_last_response', { conversationId: currentConversationId });
        console.log('Regenerate command invoked.');
        // Backend should handle deleting old msg and sending new chunks via listener
      } catch (err) {
          console.error('Error invoking regenerate command:', err);
          setError(`Failed to invoke regenerate: ${String(err)}`);
          // Don't reset isLoading here, use finally
      } finally {
          // Ensure isLoading is reset after the invoke attempt, regardless of stream outcome
          setIsLoading(false); 
      }
      // isLoading will be set to false by the stream finished listener
  };

  // Effect to load messages when currentConversationId changes
  useEffect(() => {
    loadMessages(currentConversationId);
  }, [currentConversationId]);

  // --- Global Shortcut Setup --- 
  useEffect(() => {
    let isRegistered = false;
    const shortcut = 'Command+N'; // Revert back to desired shortcut

    const registerShortcut = async () => {
      try {
        console.log('Attempting to register shortcut...');
        await register(shortcut, () => {
          console.log(`Shortcut ${shortcut} triggered`);
          // Directly call the existing function for creating a new chat
          handleNewConversation(); 
        });
        isRegistered = true;
        console.log(`Shortcut ${shortcut} registered successfully.`);
      } catch (err: unknown) {
        // Type guard or assertion
        if (err instanceof Error) {
          console.error(`Failed to register shortcut ${shortcut}:`, err.message);
        } else {
          console.error(`Failed to register shortcut ${shortcut}:`, String(err));
        }
      }
    };

    registerShortcut();

    // Cleanup: Unregister shortcut when component unmounts
    return () => {
      if (isRegistered) {
        unregisterAll()
          .then(() => console.log('Global shortcuts unregistered.'))
          .catch((err: unknown) => {
            // Type guard or assertion
            if (err instanceof Error) {
              console.error('Failed to unregister shortcuts:', err.message);
            } else {
              console.error('Failed to unregister shortcuts:', String(err));
            }
          });
      }
    };
  }, []); // Register only once on mount

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
              <Settings className="mr-2 h-4 w-4" /> Settings
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content area - Use main tag, apply pattern from guide */} 
      <main className="flex flex-col flex-grow min-w-0 min-h-0">
        {/* Error Display */} 
        {error && (
          <div className="p-4 bg-red-100 text-red-700 border-b border-red-200 flex-shrink-0 z-10">
            Error: {error} <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}
        
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
                            isStreaming={isStreaming}
                            handleStopGeneration={handleStopGeneration}
                            handleCopy={handleCopy}
                            handleRegenerate={handleRegenerate}
                            copiedMessageId={copiedMessageId}
                            isLoading={isLoading}
                            streamingMessageId={streamingMessageId}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground p-6">
                            Select a conversation or start a new one.
                        </div>
                    )
                } />
                <Route path="/settings" element={
                    <SettingsPage onModelsChanged={handleModelsChanged} />
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
