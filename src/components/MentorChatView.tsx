import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react';
import {
  ChatbotMode,
  ChatbotRole,
  LearnerWorkspace,
  MentorMessage,
} from '../types/skillpilot';
import { FriendlyErrorCard } from './ui/StateBlocks';

interface MentorChatViewProps {
  workspace: LearnerWorkspace;
  initialPrompt?: string | null;
  onClearInitialPrompt: () => void;
  onSendMessage: (
    message: string,
    options?: { role: ChatbotRole; mode: ChatbotMode }
  ) => Promise<void>;
  onAppendVoiceMessage: (msg: MentorMessage) => void;
  isSending: boolean;
  error: string | null;
}

const QUICK_PROMPTS_BY_ROLE: Record<ChatbotRole, string[]> = {
  mentor: [
    'Explain my weakest area and how to fix it',
    'Make my plan easier',
    'I only have 3 hours a week',
    'What should I focus on this week?',
  ],
  interviewer: [
    'Start a mock interview for my target career',
    'Ask me a realistic case or scenario question',
    'Give me feedback on my answer so far',
  ],
  tutor: [
    'Explain my hardest roadmap topic simply',
    'Give me a real-world example for this week’s skill',
    'Quiz me with a quick 2-minute concept check',
  ],
};

const ROLE_OPTIONS: Array<{ id: ChatbotRole; label: string; desc: string }> = [
  { id: 'mentor', label: 'Study Mentor', desc: 'Guides progress & adapts roadmap' },
  { id: 'interviewer', label: 'Mock Interviewer', desc: 'Practices role-specific questions' },
  { id: 'tutor', label: 'Concept Tutor', desc: 'Teaches topics step-by-step' },
];

const MODE_OPTIONS: Array<{ id: ChatbotMode; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'deep', label: 'Deep Reasoning' },
];

const VOICE_OPTIONS = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'];

function float32ToBase64Pcm(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
}

export function MentorChatView({
  workspace,
  initialPrompt,
  onClearInitialPrompt,
  onSendMessage,
  onAppendVoiceMessage,
  isSending,
  error,
}: MentorChatViewProps) {
  const [input, setInput] = useState('');
  const [role, setRole] = useState<ChatbotRole>('mentor');
  const [mode, setMode] = useState<ChatbotMode>('balanced');
  const [voiceName, setVoiceName] = useState('Zephyr');

  // Voice Live API state
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [liveUserCaption, setLiveUserCaption] = useState('');
  const [liveAssistantCaption, setLiveAssistantCaption] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef<boolean>(false);
  const userTranscriptBufRef = useRef<string>('');
  const assistantTranscriptBufRef = useRef<string>('');

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      onClearInitialPrompt();
    }
  }, [initialPrompt, onClearInitialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workspace.mentorHistory, isSending, liveUserCaption, liveAssistantCaption]);

  const stopScheduledAudio = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const stopVoiceSession = () => {
    stopScheduledAudio();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }

    // Flush any remaining live transcript into history
    const pendingUser = userTranscriptBufRef.current.trim();
    if (pendingUser) {
      onAppendVoiceMessage({
        id: `voice-u-${Date.now()}`,
        role: 'user',
        content: pendingUser,
        timestamp: new Date().toISOString(),
        isVoice: true,
      });
    }
    const pendingAssistant = assistantTranscriptBufRef.current.trim();
    if (pendingAssistant) {
      onAppendVoiceMessage({
        id: `voice-a-${Date.now() + 1}`,
        role: 'assistant',
        content: pendingAssistant,
        timestamp: new Date().toISOString(),
        roleLabel: ROLE_OPTIONS.find((r) => r.id === role)?.label,
        modelUsed: 'gemini-3.8-live',
        isVoice: true,
      });
    }

    userTranscriptBufRef.current = '';
    assistantTranscriptBufRef.current = '';
    setLiveUserCaption('');
    setLiveAssistantCaption('');
    setVoiceStatus('idle');
    setIsMuted(false);
  };

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playPcmChunk = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const samples = base64PcmToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  };

  const startVoiceSession = async () => {
    setVoiceError(null);
    setVoiceStatus('connecting');
    userTranscriptBufRef.current = '';
    assistantTranscriptBufRef.current = '';
    setLiveUserCaption('');
    setLiveAssistantCaption('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const weakSkills = (workspace.analysis?.skills || [])
        .filter((s) => s.status !== 'strong')
        .map((s) => s.skill)
        .slice(0, 4)
        .join(', ');

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        voice: voiceName,
        role,
        career: workspace.profile.targetCareer || 'Target Career',
        name: workspace.profile.name || 'Learner',
        gaps: weakSkills,
        lang: workspace.profile.preferredLanguage || 'en',
      });
      const ws = new WebSocket(`${wsProto}//${window.location.host}/live?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const channelData = e.inputBuffer.getChannelData(0);
          const base64 = float32ToBase64Pcm(channelData);
          ws.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            setVoiceStatus('live');
          } else if (msg.type === 'audio' && msg.data) {
            playPcmChunk(msg.data);
          } else if (msg.type === 'interrupted') {
            stopScheduledAudio();
          } else if (msg.type === 'inputTranscript' && msg.text) {
            userTranscriptBufRef.current += msg.text;
            setLiveUserCaption(userTranscriptBufRef.current);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            assistantTranscriptBufRef.current += msg.text;
            setLiveAssistantCaption(assistantTranscriptBufRef.current);
          } else if (msg.type === 'turnComplete') {
            const finalUser = userTranscriptBufRef.current.trim();
            if (finalUser) {
              onAppendVoiceMessage({
                id: `voice-u-${Date.now()}`,
                role: 'user',
                content: finalUser,
                timestamp: new Date().toISOString(),
                isVoice: true,
              });
              userTranscriptBufRef.current = '';
              setLiveUserCaption('');
            }
            const finalAssistant = assistantTranscriptBufRef.current.trim();
            if (finalAssistant) {
              onAppendVoiceMessage({
                id: `voice-a-${Date.now() + 1}`,
                role: 'assistant',
                content: finalAssistant,
                timestamp: new Date().toISOString(),
                roleLabel: ROLE_OPTIONS.find((r) => r.id === role)?.label,
                modelUsed: 'gemini-3.8-live',
                isVoice: true,
              });
              assistantTranscriptBufRef.current = '';
              setLiveAssistantCaption('');
            }
          } else if (msg.type === 'error') {
            setVoiceError(msg.message || 'Live voice session encountered an error.');
            stopVoiceSession();
          } else if (msg.type === 'closed') {
            stopVoiceSession();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        setVoiceError('Could not connect to live voice server. Please check microphone permissions and try again.');
        stopVoiceSession();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          stopVoiceSession();
        }
      };
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for real-time voice conversations.'
      );
      stopVoiceSession();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = input.trim();
    if (!clean || isSending) return;
    setInput('');
    await onSendMessage(clean, { role, mode });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            AI Mentor &amp; Voice Coach
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Switch between Study Mentor, Mock Interviewer, and Concept Tutor—via multi-turn chat or
            real-time voice.
          </p>
        </div>

        {/* Real-Time Voice Conversation Controls (gemini-3.8-live) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={voiceName}
            disabled={voiceStatus !== 'idle'}
            onChange={(e) => setVoiceName(e.target.value)}
            aria-label="Voice persona"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                Voice: {v}
              </option>
            ))}
          </select>

          {voiceStatus === 'idle' ? (
            <button
              type="button"
              onClick={startVoiceSession}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mic className="h-4 w-4" />
              Start Voice Conversation
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  isMuted
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isMuted ? 'Muted' : 'Mic On'}
              </button>
              <button
                type="button"
                onClick={stopVoiceSession}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                End Voice
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live Voice Status Strip */}
      {voiceStatus !== 'idle' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-indigo-200 text-indigo-600">
              {voiceStatus === 'connecting' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {voiceStatus === 'connecting'
                  ? 'Connecting real-time voice session...'
                  : `Live Voice Active (${voiceName} · ${
                      ROLE_OPTIONS.find((r) => r.id === role)?.label
                    })`}
              </p>
              <p className="text-xs text-slate-600">
                Speak naturally anytime — you can interrupt mid-sentence and live transcripts appear
                below.
              </p>
            </div>
          </div>
        </div>
      )}

      {voiceError && <FriendlyErrorCard message={voiceError} onRetry={startVoiceSession} />}
      {error && <FriendlyErrorCard message={error} />}

      {/* Role & Speed/Depth Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={voiceStatus !== 'idle'}
              onClick={() => setRole(r.id)}
              title={r.desc}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                role === r.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                mode === m.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Multi-Turn Conversation Thread */}
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden h-[calc(100vh-20rem)] min-h-[420px]">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 flex flex-wrap gap-2">
          {QUICK_PROMPTS_BY_ROLE[role].map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isSending}
              onClick={() => onSendMessage(prompt, { role, mode })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {workspace.mentorHistory.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                    isUser
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-indigo-600'
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-slate-50/70 text-slate-800'
                  }`}
                >
                  {(msg.roleLabel || msg.isVoice) && (
                    <p
                      className={`text-[11px] font-semibold mb-1 ${
                        isUser ? 'text-indigo-100' : 'text-slate-500'
                      }`}
                    >
                      {msg.roleLabel || (isUser ? 'You' : 'Mentor')}
                      {msg.isVoice ? ' · Voice' : ''}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.appliedAction && (
                    <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      {msg.appliedAction}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {liveUserCaption && (
            <div className="flex items-start gap-3 flex-row-reverse opacity-80">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-600 bg-indigo-600 text-white">
                <Mic className="h-4 w-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-indigo-500 text-white">
                <p className="text-[11px] text-indigo-100 mb-0.5">Speaking...</p>
                <p>{liveUserCaption}</p>
              </div>
            </div>
          )}

          {liveAssistantCaption && (
            <div className="flex items-start gap-3 opacity-90">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600">
                <Volume2 className="h-4 w-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                  Speaking ({voiceName})...
                </p>
                <p>{liveAssistantCaption}</p>
              </div>
            </div>
          )}

          {isSending && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
                Thinking through your profile and conversation history...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Text Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-200 bg-white p-4 flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder={`Message your ${
              ROLE_OPTIONS.find((r) => r.id === role)?.label
            } or start a live voice call above...`}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
