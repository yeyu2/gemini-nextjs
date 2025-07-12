import { Base64 } from "js-base64";
import { TranscriptionService } from "./transcriptionService";
import { pcmToWav } from "../utils/audioUtils";

const MODEL = "models/gemini-2.0-flash-exp";
const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const HOST = "generativelanguage.googleapis.com";
const WS_URL = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const instruction =
  "LS0tIFBBR0UgMSAtLS0NCg0KDQoNCg0KW3NvdXJjZTogMV0gUG9zaXNpIFNpa2F0IEdpZ2kNCltzb3VyY2U6IDJdIOKZoiBQb3NpdGlmDQpbc291cmNlOiAzXSBTaWthdCBnaWdpIG1pcmluZyAkNDVeXGNpcmNkeSg0NSkga2UgYXJhaCBndXNpLg0KW3NvdXJjZTogNF0g4pmjIE5lZ2F0aWYNCltzb3VyY2U6IDVdIFNpa2F0IGx1cnVzIG1lbmVrYW4ga2UgZ2lnaSAmIGd1c2kgdGVybGFsdSBrZXJhcy4NCltzb3VyY2U6IDZdIEdlcmFrYW4gTWVueWlrYXQNCltzb3VyY2U6IDddIOKZoiBQb3NpdGlmDQpbc291cmNlOiA4XSBHZXJha2FuIG1lbXV0YXIga2VjaWwgYXRhdSBuYWlrLXR1cnVuIHBlbmRlay4NCltzb3VyY2U6IDldIOKZoiBOZWdhdGlmDQpbc291cmNlOiAxMF0gR2VyYWthbiBtZW5kYXRhciBraXJpLWthbmFuIGNlcGF0ICYga2VyYXMuDQpbc291cmNlOiAxMV0gVXJ1dGFuIEJhZ2lhbiBHaWdpDQpbc291cmNlOiAxMl0gUG9zaXRpZg0KW3NvdXJjZTogMTNdIEdpZ2kgbHVhciBHaWdpIGRhbGFtIFBlcm11a2FhbiBrdW55YWgg4oaSExpkYWgNCltzb3VyY2U6IDE0XSBOZWdhdGlmDQpbc291cmNlOiAxNV0gTG9tcGF0LWxvbXBhdCBiYWdpYW4sIHRpZGFrIHRlcmF0dXIuDQoNCi0tLSBQQUdFIDIgLS0tDQoNCg0KW3NvdXJjZTogMTZdL00ZWlrYXQgTGlkYWgNCs2b3VyY2U6IDE3XSDimaIgUG9zaXRpZg0KW3NvdXJjZTogMThdIFNpa2F0IGxpZGFoIHBlbGFuIGRhcmkgYmVsYWthbmcga2UgZGVwYW4uDQogTmVnYXRpZg0KW3NvdXJjZTogMTldIFNpa2F0IGxpZGFoIHRlcmxhbHUga2VyYXMgYXRhdSB0aWRhayBkaXNpa2F0IHNhbWEgc2VrYWxpLg0KW3NvdXJjZTogMjBdIE1FTllJS0FUIExJREFIDQpbc291cmNlOiAyMV0gWA0KW3NvdXJjZTogMjJdIFNpa2F0IGxpZGFoIHBlbGFuDQpbc291cmNlOiAyM10gZGFyaSBiZWxha2FuZyBrZSBkZXBhbg0KW3NvdXJjZTogMjRdIFNpa2F0IGxpZGFoIHRlcmxhbHUga2VyYXMNCltzb3VyY2U6IDI1XSBhdGF1IHRpZGFrIGRpc2lrYXQNCltzb3VyY2U6IDI2XSBzYW1hIHNla2FsaQ==";

export class GeminiWebSocket {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private isSetupComplete: boolean = false;
  private onMessageCallback: ((text: string) => void) | null = null;
  private onSetupCompleteCallback: (() => void) | null = null;
  private audioContext: AudioContext | null = null;

  // Audio queue management
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlayingResponse: boolean = false;
  private onPlayingStateChange: ((isPlaying: boolean) => void) | null = null;
  private onAudioLevelChange: ((level: number) => void) | null = null;
  private onTranscriptionCallback: ((text: string) => void) | null = null;
  private transcriptionService: TranscriptionService;
  private accumulatedPcmData: string[] = [];

  constructor(
    onMessage: (text: string) => void,
    onSetupComplete: () => void,
    onPlayingStateChange: (isPlaying: boolean) => void,
    onAudioLevelChange: (level: number) => void,
    onTranscription: (text: string) => void,
  ) {
    this.onMessageCallback = onMessage;
    this.onSetupCompleteCallback = onSetupComplete;
    this.onPlayingStateChange = onPlayingStateChange;
    this.onAudioLevelChange = onAudioLevelChange;
    this.onTranscriptionCallback = onTranscription;
    // Create AudioContext for playback
    this.audioContext = new AudioContext({
      sampleRate: 24000, // Match the response audio rate
    });
    this.transcriptionService = new TranscriptionService();
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.sendInitialSetup();
    };

    this.ws.onmessage = async (event) => {
      try {
        let messageText: string;
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          messageText = new TextDecoder("utf-8").decode(bytes);
        } else {
          messageText = event.data;
        }

        await this.handleMessage(messageText);
      } catch (error) {
        console.error("[WebSocket] Error processing message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;

      // Only attempt to reconnect if we haven't explicitly called disconnect
      if (!event.wasClean && this.isSetupComplete) {
        setTimeout(() => this.connect(), 1000);
      }
    };
  }

  private sendInitialSetup() {
    const setupMessage = {
      setup: {
        model: MODEL,
        generation_config: {
          response_modalities: ["AUDIO"],
          speechConfig: { languageCode: "id-ID" },
        },
        system_instruction: {
          parts: [
            {
              text: `Anda adalah dokter gigi yang selalu merespons dalam Bahasa Indonesia dengan mengikuti intruksi ${instruction}. anda bukan asisten gigi dan mulut tapi fitur sigi brush contoh respon : halo kamu ingin sikat gigi dengan benar kan mari ikuti langkah yang aku berikan.anggap ini itu bukan video tapi kita seperti teman yang berbicara dengan Anda. pertama tama tolong sapa dulu, jangan menunggu saya menyapa anda`,
            },
          ],
        },
      },
    };
    this.ws?.send(JSON.stringify(setupMessage));
  }

  sendMediaChunk(b64Data: string, mimeType: string) {
    if (!this.isConnected || !this.ws || !this.isSetupComplete) return;

    const message = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: mimeType === "audio/pcm" ? "audio/pcm" : mimeType,
            data: b64Data,
          },
        ],
      },
    };

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error("[WebSocket] Error sending media chunk:", error);
    }
  }

  private async playAudioResponse(base64Data: string) {
    if (!this.audioContext) return;

    try {
      // Decode base64 to bytes
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert to Int16Array (PCM format)
      const pcmData = new Int16Array(bytes.buffer);

      // Convert to float32 for Web Audio API
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }

      // Add to queue and start playing if not already playing
      this.audioQueue.push(float32Data);
      this.playNextInQueue();
    } catch (error) {
      console.error("[WebSocket] Error processing audio:", error);
    }
  }

  private async playNextInQueue() {
    if (!this.audioContext || this.isPlaying || this.audioQueue.length === 0)
      return;

    try {
      this.isPlaying = true;
      this.isPlayingResponse = true;
      this.onPlayingStateChange?.(true);
      const float32Data = this.audioQueue.shift()!;

      // Calculate audio level
      let sum = 0;
      for (let i = 0; i < float32Data.length; i++) {
        sum += Math.abs(float32Data[i]);
      }
      const level = Math.min((sum / float32Data.length) * 100 * 5, 100);
      this.onAudioLevelChange?.(level);

      const audioBuffer = this.audioContext.createBuffer(
        1,
        float32Data.length,
        24000,
      );
      audioBuffer.getChannelData(0).set(float32Data);

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.audioContext.destination);

      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        if (this.audioQueue.length === 0) {
          this.isPlayingResponse = false;
          this.onPlayingStateChange?.(false);
        }
        this.playNextInQueue();
      };

      this.currentSource.start();
    } catch (error) {
      console.error("[WebSocket] Error playing audio:", error);
      this.isPlaying = false;
      this.isPlayingResponse = false;
      this.onPlayingStateChange?.(false);
      this.currentSource = null;
      this.playNextInQueue();
    }
  }

  private stopCurrentAudio() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.isPlayingResponse = false;
    this.onPlayingStateChange?.(false);
    this.audioQueue = []; // Clear queue
  }

  private async handleMessage(message: string) {
    try {
      const messageData = JSON.parse(message);

      if (messageData.setupComplete) {
        this.isSetupComplete = true;
        this.onSetupCompleteCallback?.();
        return;
      }

      // Handle audio data
      if (messageData.serverContent?.modelTurn?.parts) {
        const parts = messageData.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.inlineData?.mimeType === "audio/pcm;rate=24000") {
            this.accumulatedPcmData.push(part.inlineData.data);
            this.playAudioResponse(part.inlineData.data);
          }
        }
      }

      // Handle turn completion separately
      if (messageData.serverContent?.turnComplete === true) {
        if (this.accumulatedPcmData.length > 0) {
          try {
            const fullPcmData = this.accumulatedPcmData.join("");
            const wavData = await pcmToWav(fullPcmData, 24000);

            const transcription =
              await this.transcriptionService.transcribeAudio(
                wavData,
                "audio/wav",
              );
            console.log("[Transcription]:", transcription);

            this.onTranscriptionCallback?.(transcription);
            this.accumulatedPcmData = []; // Clear accumulated data
          } catch (error) {
            console.error("[WebSocket] Transcription error:", error);
          }
        }
      }
    } catch (error) {
      console.error("[WebSocket] Error parsing message:", error);
    }
  }

  disconnect() {
    this.isSetupComplete = false;
    if (this.ws) {
      this.ws.close(1000, "Intentional disconnect");
      this.ws = null;
    }
    this.isConnected = false;
    this.accumulatedPcmData = [];
  }
}
