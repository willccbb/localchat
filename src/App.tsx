import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'; // Import router components and useNavigate
// Use Tauri v2 standard import paths
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { confirm } from '@tauri-apps/plugin-dialog';
// No direct opener import needed now
// import * as opener from '@tauri-apps/plugin-opener'; 
// import { writeText } from '@tauri-apps/api/clipboard'; // Revert: Build cannot resolve
import './App.css'; // We can add styles here later
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math'; // Import remark-math
import rehypeKatex from 'rehype-katex'; // Import rehype-katex
import rehypeHighlight from 'rehype-highlight'; // Import rehype-highlight
import rehypeRaw from 'rehype-raw'; // Import rehype-raw
import { Button } from "@/components/ui/button"; // Import shadcn Button
// Revert: Remove Copy icon import
import { Plus, Settings, Trash2, SendHorizonal } from "lucide-react"; 
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
  role: 'user' | 'assistant';
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
  
  // State for the "Add New" form
  const [newName, setNewName] = useState('');
  const newProvider = 'openai_compatible'; // Hardcode for now
  const [newApiUrl, setNewApiUrl] = useState('');
  const [newApiKeyRef, setNewApiKeyRef] = useState('env:OPENAI_API_KEY');
  const [newModelName, setNewModelName] = useState('gpt-4o-mini');

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

  const handleAddModelConfig = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setError(null);
    setIsLoading(true); 

    let providerOptionsJson: string | undefined = undefined;
    if (newModelName.trim()) {
        try {
            providerOptionsJson = JSON.stringify({ model: newModelName.trim() });
        } catch (jsonErr) {
            setError('Invalid format for model name leading to JSON error.');
            setIsLoading(false);
            return;
        }
    }

    const newConfigData = {
        name: newName.trim(),
        provider: newProvider,
        api_url: newApiUrl.trim(),
        api_key_ref: newApiKeyRef.trim() || undefined,
        provider_options: providerOptionsJson,
    };

    if (!newConfigData.name || !newConfigData.provider || !newConfigData.api_url) {
        setError("Name, Provider, and API URL are required.");
        setIsLoading(false);
        return;
    }
    
    if (newConfigData.provider === 'openai_compatible' && !newModelName.trim()) {
        setError("Model Name is required for openai_compatible provider.");
        setIsLoading(false);
        return;
    }

    try {
        console.log('Invoking add_model_config...', newConfigData);
        await invoke('add_model_config', { config: newConfigData }); 
        console.log('Added model config');
        
        const fetchedConfigs = await invoke<ModelConfig[]>('list_model_configs');
        setModelConfigs(fetchedConfigs);
        await onModelsChanged(); // Refresh models in parent

        setNewName('');
        setNewApiUrl('');
        setNewApiKeyRef('env:OPENAI_API_KEY');
        setNewModelName('gpt-4o-mini');

    } catch (err) {
        console.error('Error adding model config:', err);
        setError(String(err));
    } finally {
        setIsLoading(false);
    }
  };

  const handleDeleteModelConfig = async (idToDelete: string) => {
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

  // TODO: Add Edit functionality later

  return (
    // Remove h-full and overflow-y-auto, let parent scroll
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      {error && (
        <div className="text-red-600 bg-red-100 p-3 rounded-md mb-6">
          Error: {error}
        </div>
      )}

      {/* Content wrapper */} 
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Model Configurations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && <p>Loading configurations...</p>}
            {!isLoading && modelConfigs.length === 0 && <p>No configurations found.</p>}
            {modelConfigs.map(config => (
              <Card key={config.id} className="p-4 flex justify-between items-center">
                <div className="space-y-1">
                  <div className="font-medium">{config.name}</div>
                  <div className="text-sm text-muted-foreground">Model: {getModelNameFromOptions(config.provider_options)}</div>
                  <div className="text-sm text-muted-foreground">URL: {config.api_url}</div>
                  <div className="text-sm text-muted-foreground">Key Ref: {config.api_key_ref || 'N/A'}</div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteModelConfig(config.id)}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </Card>
            ))}
          </CardContent>
        </Card>

        <div className="pt-6 border-t">
          <Card>
            <CardHeader>
              <CardTitle>Add New Model</CardTitle>
            </CardHeader>
            <form onSubmit={handleAddModelConfig}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newName">Name</Label>
                  <Input id="newName" value={newName} onChange={e => setNewName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newApiUrl">API URL</Label>
                  <Input id="newApiUrl" type="url" value={newApiUrl} onChange={e => setNewApiUrl(e.target.value)} required placeholder="e.g., https://api.openai.com/v1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newApiKeyRef">API Key Ref</Label>
                  <Input id="newApiKeyRef" value={newApiKeyRef} onChange={e => setNewApiKeyRef(e.target.value)} placeholder="e.g., env:MY_KEY or keyring" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newModelName">Model ID</Label>
                  <Input id="newModelName" value={newModelName} onChange={e => setNewModelName(e.target.value)} required placeholder="e.g., gpt-4o-mini" />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Adding...' : 'Add Configuration'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Main Chat Area Component
const ChatArea = ({ 
  currentMessages, 
  currentInput, 
  setCurrentInput, 
  handleSendMessage,
  currentConversation,
  availableModels,
  handleModelChange
}: { 
  currentMessages: Message[], 
  currentInput: string, 
  setCurrentInput: (val: string) => void, 
  handleSendMessage: () => void,
  currentConversation: Conversation | undefined,
  availableModels: ModelConfig[],
  handleModelChange: (newModelConfigId: string) => Promise<void>
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  return (
    // Restore h-full, remove root padding/spacing
    <div className="flex flex-col w-full h-full"> 
      {/* Top Bar: Model Selector - Restore padding, keep shrink */}
      {currentConversation && availableModels.length > 0 && (
        <div className="p-3 border-b border-border flex justify-end w-full flex-shrink-0">
          {/* Shadcn Select component */}
          <Select 
            value={currentConversation.model_config_id}
            onValueChange={handleModelChange}
          >
            {/* Trigger contains the visual element */} 
            <SelectTrigger className="w-[280px]">
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
      )}

      {/* Message list - Restore overflow-y-auto, add padding, keep grow, add min-h-0 */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 min-h-0">
        {currentMessages.map((msg, index) => (
          <div key={msg.id || index} className={`group relative flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={cn(
                "p-3 rounded-lg",
                msg.role === 'user' ? 'bg-muted text-foreground' : ''
              )}
            >
              <div className="prose dark:prose-invert prose-sm max-w-none w-full break-words">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
                  components={{
                    // Custom link renderer to invoke Rust command
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
                    // Custom renderer for code blocks
                    code(props) {
                      const {children, className, node, ...rest} = props
                      const match = /language-(\w+)/.exec(className || '')
                      // Check if language is mermaid
                      if (match && match[1] === 'mermaid') {
                        return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
                      }
                      // Otherwise, use default code block rendering (provided by rehype-highlight)
                      return (
                        <code {...rest} className={className}>
                          {children}
                        </code>
                      )
                    },
                    // You might need to adjust `pre` rendering too if default is unwanted
                    pre(props) {
                      // The `code` component above handles mermaid, 
                      // so this `pre` will wrap either the default code block or the MermaidDiagram
                      return <pre>{props.children}</pre>
                    }
                  }}
                >
                   {typeof msg.content === 'string' ? msg.content : ''}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Restore padding, keep shrink */} 
      <div className="p-4 flex-shrink-0">
        <form 
          className="flex items-center"
          onSubmit={(e) => { 
            e.preventDefault(); 
            handleSendMessage(); 
          }}
        >
          <Textarea
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-grow resize-none bg-muted border-0 rounded-md p-2.5 focus-visible:ring-1 focus-visible:ring-ring"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
        </form>
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

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
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

  // Refs for debouncing stream updates
  const streamUpdateTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const pendingStreamDeltas = useRef<Record<string, string>>({});

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
      console.log("Loaded messages:", msgs);
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

    // Define the "end of stream" delay (ms)
    const END_OF_STREAM_DELAY = 500; // Increased delay

    // Cleanup function to clear all timers on unmount
    const cleanupTimers = () => {
      Object.values(streamUpdateTimers.current).forEach(clearTimeout);
      streamUpdateTimers.current = {};
      pendingStreamDeltas.current = {};
    };

    async function setupChunkListener() {
      try {
        const unlisten = await listen<AssistantMessageChunk>('assistant_message_chunk', (event) => {
          // console.log('Received assistant_message_chunk:', event.payload);
          const { conversationId, messageId, delta, isFirstChunk } = event.payload;

          // Only process if it belongs to the currently selected conversation
          if (conversationId !== currentConversationId) {
            return;
          }

          // --- Debounce Logic --- 

          // 1. Accumulate delta
          pendingStreamDeltas.current[messageId] = (pendingStreamDeltas.current[messageId] || '') + delta;

          // 2. Clear existing timer for this message
          if (streamUpdateTimers.current[messageId]) {
            clearTimeout(streamUpdateTimers.current[messageId]);
          }

          // 3. Handle first chunk immediately (create message structure)
          if (isFirstChunk) {
            setCurrentMessages(prevMessages => {
              // Avoid adding if message already exists (e.g., race condition)
              if (prevMessages.some(m => m.id === messageId)) {
                return prevMessages;
              }
              const newMessage: Message = {
                id: messageId,
                conversation_id: conversationId,
                role: 'assistant',
                content: '', // Start with empty content, update via debounce
                timestamp: new Date().toISOString(),
                metadata: undefined,
              };
              return [...prevMessages, newMessage];
            });
          }

          // 4. Set new timer to apply accumulated deltas *after assumed end of stream*
          streamUpdateTimers.current[messageId] = setTimeout(() => {
            const accumulatedDelta = pendingStreamDeltas.current[messageId];
            if (accumulatedDelta) {
              setCurrentMessages(prevMessages => {
                return prevMessages.map(msg => {
                  if (msg.id === messageId) {
                    // Update content ONLY when timer fires after last chunk
                    return {
                      ...msg,
                      content: msg.content + accumulatedDelta, 
                    };
                  }
                  return msg;
                });
              });
              // Reset pending delta for this message
              pendingStreamDeltas.current[messageId] = ''; 
            }
             // Clean up timer ref
             delete streamUpdateTimers.current[messageId];
          }, END_OF_STREAM_DELAY); // Use the longer delay

        });
        // Store the cleanup function for the listener itself
        unlistenChunkFn = unlisten;
      } catch (e) {
        console.error("Failed to set up assistant message chunk listener:", e);
        setError("Failed to connect for assistant responses.");
      }
    }

    setupChunkListener();

    // Cleanup listener and timers on unmount
    return () => {
      console.log('Cleaning up assistant chunk listener and timers');
      if (unlistenChunkFn) {
        unlistenChunkFn();
      }
      cleanupTimers(); // Clear any pending timers
    };
  }, [currentConversationId]); // Re-run if currentConversationId changes

  // Effect to load messages when currentConversationId changes
  useEffect(() => {
    loadMessages(currentConversationId);
  }, [currentConversationId]);

  // Handle creating a new conversation
  const handleNewConversation = async () => {
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
  };

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!currentInput.trim() || !currentConversationId || isLoading) return;
    console.log(`Sending message to ${currentConversationId}...`);
    setError(null);
    setIsLoading(true);
    const userMessageContent = currentInput;
    setCurrentInput(''); // Clear input immediately

    // Define temp message here so it's in scope for the catch block
    const tempUserMessage: Message = {
        id: `temp_${Date.now()}`,
        conversation_id: currentConversationId,
        role: 'user',
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
    }
  };

  // Handle deleting a conversation
  const handleDeleteConversation = async (idToDelete: string) => {
      console.log(`Deleting conversation ${idToDelete}...`);
      const confirmed = await confirm(`Are you sure you want to delete this conversation?`, { title: 'Confirm Deletion' });
      if (!confirmed) return;

      setError(null);
      try {
          await invoke('delete_conversation', { conversationId: idToDelete });
          console.log(`Conversation ${idToDelete} deleted.`);
          setConversations(prev => prev.filter(c => c.id !== idToDelete));
          // If the deleted one was selected, select the first one or null
          if (currentConversationId === idToDelete) {
              const remainingConvos = conversations.filter(c => c.id !== idToDelete);
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

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */} 
      {/* Use aside tag for semantics, keep layout classes */} 
      <aside className="w-64 border-r border-border flex flex-col flex-shrink-0">
        {/* Top Section: New Chat Button - Use p-3 for height consistency */}
        <div className="p-3 border-b border-border">
          <Button variant="outline" className="w-full justify-start" onClick={handleNewConversation}>
            <Plus className="mr-2 h-4 w-4" /> New Chat
          </Button>
        </div>

        {/* Middle Section: Conversation List */}
        <div className="flex-grow overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <Link
              key={conv.id}
              to={`/chat/${conv.id}`}
              onClick={() => setCurrentConversationId(conv.id)}
              className={cn(
                "group flex items-center justify-between p-2 rounded-md text-sm font-medium w-full",
                currentConversationId === conv.id
                  ? "bg-accent text-accent-foreground" // Selected style
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground", // Default style
                editingConversationId === conv.id ? "bg-muted" : "" // Style when editing
              )}
              onDoubleClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault(); // Prevent navigation on double click if editing
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
                    className="flex-grow bg-transparent border border-input rounded-sm px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus // Focus the input when it appears
                 />
              ) : (
                  <span className="truncate flex-grow">{conv.title || `Chat ${conv.id.substring(0, 4)}`}</span>
              )}

               {/* Action buttons (Delete) - Only show when not editing */}
              {editingConversationId !== conv.id && currentConversationId === conv.id && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                   {/* Revert: Remove Rename Button 
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.preventDefault(); handleStartEditing(conv); }} title="Rename">
                        <Pencil className="h-3 w-3" /> 
                    </Button> 
                    */}
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={(e) => { e.preventDefault(); handleDeleteConversation(conv.id); }} title="Delete">
                        <Trash2 className="h-3 w-3" /> 
                    </Button>
                </div>
              )}
            </Link>
          ))}
        </div>

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
