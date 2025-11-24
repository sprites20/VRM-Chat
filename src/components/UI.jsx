import { useRef, useState, useEffect, useCallback } from "react";
import {
  FiChevronDown,
  FiChevronUp,
  FiMessageSquare,
  FiMaximize,
} from "react-icons/fi"; // Added FiMaximize
import io from "socket.io-client";
import { ScheduleTimeLine } from "./ScheduleTimeline";
import {PersonalityChanger} from "./PersonalityChanger";
import {PianoUI} from "./PianoUI";
import {Catalog} from "./Catalog";

import { screenshotEventEmitter } from "../utils/eventEmitter"; // Adjust path as needed
import {eventBus} from "./EventBus";
import { isPianoOpen, setPianoStateOpen } from "./UIStates";
import { createWLipSyncNode } from "wlipsync";

import { visemeWeightsRef } from "./lipsyncrefs";

import { getGlobalUserData } from './Globals';
const BACKEND_URL = "http://localhost:5001";
import * as THREE from 'three'

export const UI = ({deviceId}) => {
  const [visible, setVisible] = useState(true);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("Global");
  const [globalMessages, setGlobalMessages] = useState([]);
  const [localMessages, setLocalMessages] = useState([]);
  const textareaRef = useRef(null);
  const chatRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [sid, setSid] = useState(null);
  const [userId, setUserId] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [charEditorOpen, setCharEditorOpen] = useState(false);
  const [pianoOpen, setPianoOpen] = useState(true);
  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [inputText, setInputText] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [screenshotData, setScreenshotData] = useState(null); // Effect to listen for the screenshot event
  const [isFullScreen, setIsFullScreen] = useState(false); // New state for fullscreen

  
  const [materials, setMaterials] = useState([])
  const [meshes, setMeshes] = useState([]) // 🆕 New state for meshes
  // State to force update the sidebars component
  const [updateKey, setUpdateKey] = useState(0)

  
  const handleMaterialsReady = useCallback((mats) => {
      setMaterials(mats);
      setUpdateKey(prev => prev + 1);
  }, []);
  
  // 🆕 New handler for meshes
  const handleMeshesReady = useCallback((m) => {
    setMeshes(m);
    setUpdateKey(prev => prev + 1);
  }, []);
  
  // Function to trigger a re-render when a texture or visibility is changed
  const handleUpdate = useCallback(() => {
    setUpdateKey(prev => prev + 1) 
  }, [])

  /** Converts a Three.js texture to a displayable data URL */
function textureToDataURL(texture) {
  if (!texture || !texture.image) return null

  const img = texture.image

  if (img instanceof HTMLImageElement) return img.src

  if (img instanceof ImageBitmap || img instanceof HTMLCanvasElement) {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  }
  return null
}

useEffect(() => {
  let interval = setInterval(() => {
    const userData = getGlobalUserData();
    const vrm = userData?.vrm;
    if (!vrm) return; // still loading

    clearInterval(interval); // stop polling

    console.log("VRM ready:", vrm);

    const mats = [];
    const meshes = [];

    vrm.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        meshes.push({
          name: obj.name || 'Unnamed Mesh',
          object: obj,
          initialVisible: obj.visible,
        });

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((m) => {
          if (!mats.some(item => item.material === m)) {
            mats.push({
              meshName: obj.name,
              material: m,
              materialName: m.name || obj.name,
              map: m.map || null,
              originalMap: m.map || null,
            });
          }
        });
      }
    });

    setMaterials(mats);
    setMeshes(meshes);

  }, 200);

  return () => clearInterval(interval);
}, [materialEditorOpen]);

/** Texture Editor Component (outside Canvas) */
function TextureEditor({ materials, onTextureChange }) {
  const fileInputRef = useRef(null)
  // Store the material info object, which contains the THREE.Material object
  const [selectedMaterialInfo, setSelectedMaterialInfo] = useState(null) 
  
  const selectedMat = selectedMaterialInfo?.material || null
  
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file || !selectedMat) return

    const reader = new FileReader()
    reader.onload = (event) => {
      THREE.Cache.enabled = false

      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        const newTex = new THREE.Texture(img)
        newTex.flipY = false
        newTex.encoding = THREE.sRGBEncoding 
        newTex.needsUpdate = true

        if (selectedMat.map) selectedMat.map.dispose()

        selectedMat.map = newTex
        
        // Handle MToon-specific texture reference
        if (selectedMat.userData?.isMToonMaterial) {
          selectedMat.userData.mainTexture = newTex
        }

        selectedMat.needsUpdate = true 
        console.log('Texture updated for material:', selectedMat.name)
        
        // Trigger parent re-render to update the thumbnail
        onTextureChange()
      }
    }
    reader.readAsDataURL(file)
  }

  const restoreOriginal = () => {
    if (!selectedMat || !selectedMaterialInfo) return
    
    const original = selectedMaterialInfo.originalMap || null
    
    // Dispose current custom map
    if (selectedMat.map && selectedMat.map !== original) {
        selectedMat.map.dispose()
    }
    
    selectedMat.map = original
    
    // Handle MToon-specific texture reference
    if (selectedMat.userData?.isMToonMaterial) {
      selectedMat.userData.mainTexture = original
    }
    
    selectedMat.needsUpdate = true
    
    console.log('Restored original texture for:', selectedMat.name)
    
    // Trigger parent re-render to update the thumbnail
    onTextureChange()
  }

  return (
    <div style={{ padding: 10, background: '#fafafa', height: '100%', overflow: 'hidden' }}>
      <h2 style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '1.2em' }}>🎨 VRM Materials</h2>
      <div style={{ maxHeight: 'calc(100vh - 70px)', overflowY: 'auto' }}>
      {materials.map((mInfo, i) => { 
        const imgSrc = mInfo.material.map ? textureToDataURL(mInfo.material.map) : null
        return (
          <div
            key={i}
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: 6,
              marginBottom: 8,
              background: selectedMat === mInfo.material ? 'rgba(76,175,80,0.2)' : 'white',
              cursor: 'pointer' 
            }}
            onClick={() => setSelectedMaterialInfo(mInfo)} 
          >
            <strong>{mInfo.materialName}</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {/* Image/No Map Display */}
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt="Texture"
                  width={80}
                  height={80}
                  style={{ borderRadius: 6, objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 80,
                    height: 80,
                    background: '#ddd',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#555',
                  }}
                >
                  No Map
                </div>
              )}
              
              {/* Change Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedMaterialInfo(mInfo);
                  fileInputRef.current.click()
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#4CAF50',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Change
              </button>
              
              {/* Restore Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedMaterialInfo(mInfo);
                  restoreOriginal()
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#f44336',
                  color: 'white',
                  cursor: 'pointer',
                }}
                disabled={!mInfo.originalMap || mInfo.material.map === mInfo.originalMap}
              >
                Restore
              </button>
            </div>
          </div>
        )
      })}
      </div> {/* End of scrollable container */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        onClick={(e) => e.target.value = null} 
      />
    </div>
  )
}

// 🆕 NEW COMPONENT: Mesh Visibility Editor
function MeshVisibilityEditor({ meshes, onVisibilityChange }) {
  const toggleVisibility = useCallback((meshItem) => {
    // Toggle the actual THREE.Mesh object's visibility
    meshItem.object.visible = !meshItem.object.visible

    // Trigger a re-render in the parent component
    onVisibilityChange()
  }, [onVisibilityChange])

  return (
    <div style={{ padding: 10, background: '#fafafa', height: '100%', overflow: 'auto' }}>
      <h2 style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '1.2em' }}>👁️ Mesh Visibility</h2>
      <div style={{ maxHeight: 'calc(100vh - 70px)', overflowY: 'auto' }}>
        {meshes.map((mInfo, i) => (
          <div
            key={i}
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: 6,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: mInfo.object.visible ? 'white' : '#fdd',
            }}
          >
            <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{mInfo.name}</strong>
            </span>
            <button
              onClick={() => toggleVisibility(mInfo)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: mInfo.object.visible ? '#FF9800' : '#4CAF50',
                color: 'white',
                cursor: 'pointer',
                marginLeft: 10
              }}
            >
              {mInfo.object.visible ? 'Hide' : 'Show'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

  useEffect(() => {
    if (!deviceId) return;
    console.log("Device ID (UI):", deviceId);
  }, [deviceId]);

  useEffect(() => {
    const handleScreenshotTaken = (event) => {
      const imageData = event.detail.imageData;
      setScreenshotData(imageData);
    };

    screenshotEventEmitter.addEventListener(
      "screenshotTaken",
      handleScreenshotTaken
    );

    return () => {
      screenshotEventEmitter.removeEventListener(
        "screenshotTaken",
        handleScreenshotTaken
      );
    };
  }, []);

  const getScreenshotBase64 = () =>
    new Promise((resolve) => {
      const handler = (e) => {
        screenshotEventEmitter.removeEventListener("screenshotTaken", handler);
        resolve(e.detail.imageData);
      };
      screenshotEventEmitter.addEventListener("screenshotTaken", handler, {
        once: true,
      });
    });

  const ENABLE_SOCKET = false;

  useEffect(() => {
    if (!ENABLE_SOCKET) return;

    const socket = io("http://localhost:5000", {
      query: {
        user_id: "localuser",
      },
    });

    setSocket(socket);

    socket.on("connect", () => {
      console.log("Connected to socket server.");
    });

    socket.on("server_response", (data) => {
      console.log("Received server response:", data);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const mailbox = (message) => {
      setMessages(prev => [...prev, `${message.from} said: ${message.content}`]);
    };

    console.log("Registering event bus listener for 'user'");
    eventBus.register("user", mailbox);

    return () => {
      eventBus.unregister("user");
    };
  }, []);

  

  const handleKeyDown = async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input;
      await console.log(trimmed);
      setInput("");
      if (trimmed) {
        if (mode === "Global") {
          setGlobalMessages((prev) => [...prev, "User: " + trimmed]);
          console.log("Setting input text: ", trimmed);
          const screenshotPromise = getScreenshotBase64();
          screenshotEventEmitter.dispatchEvent(
            new CustomEvent("requestScreenshot")
          );
          const base64Image = await screenshotPromise;
          const messageToSend = {
            text: trimmed,
            image: base64Image,
            sender: userId,
            conversation_id: selectedConversation,
          };
          console.log(messageToSend);
          textareaRef.current?.blur();
          setInput("");
          handleAudioSubmit(trimmed, base64Image, "Global");
        } else {
          setLocalMessages((prev) => [...prev, "User: " + trimmed]);
          console.log("Setting input text: ", trimmed);
          const screenshotPromise = getScreenshotBase64();
          screenshotEventEmitter.dispatchEvent(
            new CustomEvent("requestScreenshot")
          );
          const base64Image = await screenshotPromise;
          const messageToSend = {
            text: trimmed,
            image: base64Image,
            sender: userId,
            conversation_id: selectedConversation,
          };
          console.log(messageToSend);
          textareaRef.current?.blur();
          setInput("");
          handleAudioSubmit(trimmed, base64Image, "Local");
        }
      }
    }
  };
  

const lipNodeRef = useRef(null);
const audioContextRef = useRef(null);
const mediaStreamRef = useRef(null);
const audioElementRef = useRef(null);
// Use a ref or state to store the analyser if you need access to it later,
// or make it a global 'let' if you prefer to mimic the original structure's intent for shared variables.
// For this fix, I'll move 'source' and 'analyser' management to prevent the error.

// We will use a ref for the analyser to make it accessible across functions
const analyserRef = useRef(null);

const startlipsync = async () => {
  // ❌ REMOVE local 'let source;' here as it causes a problem when source.connect is called
  let stream; // Still here, though unused in the snippet

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioContextRef.current = audioContext;

  const profileResponse = await fetch("/profile.json");
  if (!profileResponse.ok) throw new Error("Failed to load profile.json"); // FIX: Missing quotes around string literal
  const profile = await profileResponse.json();

  const lipNode = await createWLipSyncNode(audioContext, profile);
  lipNodeRef.current = lipNode;

  // ❌ REMOVED: source.connect(lipNode); // 'source' is undefined here, causing the error.

  // Create the analyser node once and store it in a ref
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  // const dataArray = new Uint8Array(analyser.frequencyBinCount); // dataArray is local and unused outside this scope
  analyserRef.current = analyser;

  // ❌ REMOVED: source.connect(analyser); // 'source' is undefined here, causing the error.
};

useEffect(() => {
  startlipsync();
}, []);
const handleAudioSubmit = async (message, base64Image, mode) => {
    setLoading(true);
    let chunkJobQueue = [];
    let isStreaming = true;
    let currentChunkIndex = 0;

    console.log("Broadcasting user message: ", message, deviceId);
    eventBus.broadcast("user", message);

    try {
        const response = await fetch(`${BACKEND_URL}/stream_and_chunk_tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message, device_id: deviceId, base64_image: base64Image })
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = '';

        const processTextStream = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) { isStreaming = false; break; }

                streamBuffer += decoder.decode(value, { stream: true });
                const messages = streamBuffer.split('\n\n');
                streamBuffer = messages.pop();

                for (const message of messages) {
                    if (!message.startsWith('data:')) continue;
                    const data = message.substring(5);

                    if (data.startsWith("FULL_RESPONSE|")) {
                        const fullText = data.substring(14);
                        if (mode === "Global") setGlobalMessages(prev => [...prev, "AI Response: " + fullText]);
                        else setLocalMessages(prev => [...prev, "AI Response: " + fullText]);
                    } else if (data === "END_OF_STREAM") {
                        isStreaming = false;
                    } else if (data.startsWith("ERROR|")) {
                        console.error("LLM Streaming Error:", data.substring(6));
                        alert("LLM Streaming Error: " + data.substring(6));
                        reader.cancel();
                        break;
                    } else {
                        // Queue TTS chunks
                        const [job_id, generated_text] = data.split('|');
                        chunkJobQueue.push({ job_id, generated_text });
                        if (chunkJobQueue.length === 1 && currentChunkIndex === 0) playbackLoop();
                    }
                }
            }
        };

        processTextStream();

        const playbackLoop = async () => {
            if (currentChunkIndex >= chunkJobQueue.length && !isStreaming) {
                setLoading(false); 
                return;
            }
            if (currentChunkIndex >= chunkJobQueue.length) {
                await new Promise(r => setTimeout(r, 200));
                requestAnimationFrame(playbackLoop);
                return;
            }

            const { job_id, generated_text } = chunkJobQueue[currentChunkIndex];

            try {
                let audioUrl = null;
                while (true) {
                    const statusRes = await fetch(`${BACKEND_URL}/get_tts/${job_id}`);
                    if (!statusRes.ok) throw new Error("Error fetching chunk status");

                    const contentType = statusRes.headers.get("Content-Type");
                    if (contentType.includes("application/json")) {
                        const data = await statusRes.json();
                        if (data.status === "done") { audioUrl = `${BACKEND_URL}/get_tts/${job_id}`; break; }
                        else if (data.status === "error") throw new Error("TTS chunk generation error: " + data.message);
                    } else { audioUrl = `${BACKEND_URL}/get_tts/${job_id}`; break; }

                    await new Promise(r => setTimeout(r, 500));
                }

                const audio = new Audio(audioUrl);
                audio.crossOrigin = "anonymous";

                await new Promise(resolve => {
                    audio.onended = () => { 
                        visemeWeightsRef.current = { A:0,E:0,I:0,O:0,U:0 };
                        currentChunkIndex++;
                        resolve(); 
                    };

                    audio.play().then(async () => {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        audioContextRef.current = audioContext;
                        const profileResponse = await fetch("/profile.json");
                        const profile = await profileResponse.json();
                        const lipNode = await createWLipSyncNode(audioContext, profile);
                        lipNodeRef.current = lipNode;
                        const source = audioContext.createMediaElementSource(audio);
                        source.connect(lipNode);
                        source.connect(audioContext.destination);

                        const logLoop = () => {
                            if (!audio.paused && lipNodeRef.current?.weights) {
                                visemeWeightsRef.current = lipNodeRef.current.weights;
                                requestAnimationFrame(logLoop);
                            }
                        };
                        logLoop();
                    }).catch(err => { console.error(err); resolve(); });
                });

                requestAnimationFrame(playbackLoop);
            } catch (err) {
                console.error("Chunk playback error:", err);
                alert("TTS chunk error: " + err.message);
                isStreaming = false; 
                setLoading(false);
            }
        };

    } catch (err) {
        alert("Fatal submission error: " + err.message);
        setLoading(false);
    }
};

  const toggleMode = () => {
    setMode((prev) => (prev === "Global" ? "Local" : "Global"));
  };

  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.key === "/") {
        e.preventDefault();
        setVisible(true);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [globalMessages, localMessages, mode]);

  const messagesToRender = mode === "Global" ? globalMessages : localMessages;

  // Fullscreen logic
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullScreen(true);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullScreen(false);
        });
      }
    }
  };
  
  return (
  <section className="fixed inset-0 z-10 pointer-events-none">
    {/* Chat UI */}
    <div className="absolute top-4 left-4 w-72 md:w-96 lg:max-w-[20vw] xl:max-w-[20vw] pointer-events-auto">
      {/* Navbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/20 backdrop-blur-md text-white text-sm md:text-base font-semibold rounded-t-lg border border-white/30">
        <div className="flex items-center gap-2">
          <FiMessageSquare className="text-lg md:text-xl" />
          <span>Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMode}
            className="px-2 py-0.5 text-xs md:text-sm bg-white/10 border border-white/30 rounded hover:bg-white/20 transition-colors"
          >
            {mode === "Global" ? "🌐 Global" : "🏠 Local"}
          </button>
          <button
            onClick={toggleFullScreen}
            className="hover:text-blue-400 transition-colors"
            title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            <FiMaximize className="text-xl md:text-2xl" />
          </button>
          <button
            onClick={() => setVisible(!visible)}
            className="hover:text-red-400 transition-colors"
          >
            {visible ? (
              <FiChevronUp className="text-xl md:text-2xl" />
            ) : (
              <FiChevronDown className="text-xl md:text-2xl" />
            )}
          </button>
        </div>
      </div>

      {/* Chat Content */}
      {visible && (
        <div className="flex flex-col h-[30vh] max-h-[40vh] md:h-[30vh] md:max-h-[40vh] bg-white/10 backdrop-blur-md border border-t-0 border-white/30 rounded-b-lg p-2 justify-between">
          <div ref={chatRef} className="flex-grow overflow-y-auto space-y-1 pr-1">
            {messagesToRender.map((msg, i) => (
              <div
                key={i}
                className="text-white text-xs md:text-sm lg:text-base p-1 bg-white/10 rounded w-fit break-words"
              >
                {msg}
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="h-12 resize-none bg-transparent outline-none text-white text-sm md:text-base placeholder-white/60"
            placeholder={`Type your ${mode.toLowerCase()} message...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}
    </div>

    {/* Subtitles at bottom center */}
    <div className="absolute bottom-30 left-1/2 transform -translate-x-1/2 px-2 text-white text-xl md:text-2xl lg:text-3xl font-semibold pointer-events-auto">
      This is your subtitle text.
    </div>

    {/* Scheduler Button */}
    <div className="absolute top-1/2 left-4 transform -translate-y-1/2 pointer-events-auto">
      <button
        onClick={() => setSchedulerOpen(!schedulerOpen)}
        className="bg-white/20 text-white px-3 py-2 rounded-lg border border-white/30 hover:bg-white/30 transition-colors text-sm md:text-base lg:text-lg"
      >
        Scheduler
      </button>
    </div>

    <div className="pointer-events-auto">
      <div className={schedulerOpen ? "block" : "hidden"}>
        <ScheduleTimeLine deviceId={deviceId} />
      </div>
    </div>

    {/* Catalog Button */}
    <div className="absolute top-1/2 left-4 transform -translate-y-[120px] pointer-events-auto">
      <button
        onClick={() => setCatalogOpen(!catalogOpen)}
        className="bg-white/20 text-white px-3 py-2 rounded-lg border border-white/30 hover:bg-white/30 transition-colors text-sm md:text-base lg:text-lg"
      >
        Catalog
      </button>
    </div>

    <div className="pointer-events-auto">
      <div className={catalogOpen ? "block" : "hidden"}>
        <Catalog />
      </div>
    </div>

    {/* Character Editor Button */}
    <div className="absolute top-1/2 left-4 transform -translate-y-[80px] pointer-events-auto">
      <button
        onClick={() => setCharEditorOpen(!charEditorOpen)}
        className="bg-white/20 text-white px-3 py-2 rounded-lg border border-white/30 hover:bg-white/30 transition-colors text-sm md:text-base lg:text-lg"
      >
        Character Editor
      </button>
    </div>

    <div className="pointer-events-auto">
      <div className={charEditorOpen ? "block" : "hidden"}>
        <PersonalityChanger deviceId={deviceId} />
      </div>
    </div>

    {/* Piano Button */}
    <div className="absolute top-1/2 left-4 transform -translate-y-[-35px] pointer-events-auto">
      <button
        onClick={() => {
          setPianoOpen(!pianoOpen);
          setPianoStateOpen(pianoOpen);
        }}
        className="bg-white/20 text-white px-3 py-2 rounded-lg border border-white/30 hover:bg-white/30 transition-colors text-sm md:text-base lg:text-lg"
      >
        Piano
      </button>
    </div>

    
    <div className="pointer-events-auto">
      <div className={!pianoOpen ? "block" : "hidden"}>
        <PianoUI />
      </div>
    </div>

    <div className="absolute top-1/2 left-4 transform -translate-y-[-90px] pointer-events-auto">
      <button
        onClick={() => {
          setMaterialEditorOpen(!materialEditorOpen);
        }}
        className="bg-white/20 text-white px-3 py-2 rounded-lg border border-white/30 hover:bg-white/30 transition-colors text-sm md:text-base lg:text-lg"
      >
        Material Editor
      </button>
    </div>

    {/* ✅ Right side panels (Texture + Mesh Visibility) */}
    <div
      style={{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      display: materialEditorOpen ? 'flex' : 'none',
      flexDirection: 'column',
      width: '25vw',
      height: '100vh', // ✅ ensure full height
      zIndex: 20,
      background: '#fff',
      pointerEvents: 'auto',
      borderLeft: '1px solid #ddd',
    }}
    >
      <div
        style={{
          flex: 1,
          borderBottom: '1px solid #ddd',
          overflowY: 'auto',
          background: '#f9f9f9',
        }}
      >
        <TextureEditor
          key={'tex-' + updateKey}
          materials={materials}
          onTextureChange={handleUpdate}
        />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#fafafa',
        }}
      >
        <MeshVisibilityEditor
          key={'mesh-' + updateKey}
          meshes={meshes}
          onVisibilityChange={handleUpdate}
        />
      </div>
    </div>
  </section>
);
}