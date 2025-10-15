import React, { useEffect } from "react";
import { useRef, useState } from "react";
import { io } from "socket.io-client";
import TextField from "@mui/material/TextField";
import { Badge, Button, IconButton } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import styles from "../styles/videoComponent.module.css";
import { useNavigate } from "react-router-dom";
const server_url = "http://localhost:8000";

var connections = {};

const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();

  const localVideoRef = useRef();
  const videoRef = useRef([]);
  // initial toggles set to false (or true depending on desired default)
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);

  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [screen, setScreen] = useState(false);

  const [showModal, setModal] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState(false);

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(3);

  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [videos, setVideos] = useState([]);

  /* ---------------- MEDIA PERMISSIONS ---------------- */
  const getPermissions = async () => {
    try {
      // Use enumerateDevices to check existence first (avoid multiple permission prompts)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoDevice = devices.some((d) => d.kind === "videoinput");
      const hasAudioDevice = devices.some((d) => d.kind === "audioinput");

      setVideoAvailable(hasVideoDevice);
      setAudioAvailable(hasAudioDevice);
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      // request combined media based on availability
      if (hasVideoDevice || hasAudioDevice) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: hasVideoDevice,
          audio: hasAudioDevice,
        });
        // set local stream and display
        window.localStream = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.log("Permissions error:", err);
    }
  };

  useEffect(() => {
    getPermissions();
  }, []);

  /* -------------- USER MEDIA / STREAM HELPERS -------------- */
  const getUserMediaSuccess = (stream) => {
    try {
      if (window.localStream) {
        window.localStream.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    // notify peers by creating offers
    for (let id in connections) {
      if (id === socketIdRef.current) continue;
      try {
        if (connections[id].addStream) {
          connections[id].addStream(window.localStream);
        } else {
          window.localStream
            .getTracks()
            .forEach((t) => connections[id].addTrack(t, window.localStream));
        }
      } catch (e) {
        console.log(e);
      }

      connections[id]
        .createOffer()
        .then((description) => {
          return connections[id].setLocalDescription(description);
        })
        .then(() => {
          if (socketRef.current) {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription })
            );
          }
        })
        .catch((e) => console.log(e));
    }

    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setVideo(false);
          setAudio(false);
          try {
            const tracks = localVideoRef.current.srcObject.getTracks();
            tracks.forEach((t) => t.stop());
          } catch (e) {}
          // set silence/black stream etc. (optional)
        })
    );
  };

  const getUserMedia = () => {
    // if both toggles are defined, request updated stream
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .catch((e) => console.log("getUserMedia error:", e));
    } else {
      try {
        const tracks = localVideoRef.current.srcObject.getTracks();
        tracks.forEach((t) => t.stop());
      } catch (e) {}
    }
  };

  useEffect(() => {
    // only call when both video and audio toggles have been set at least once
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, audio]);

  /* ---------------- SIGNAL HANDLER ---------------- */
  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId]
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === "offer") {
              return connections[fromId].createAnswer();
            }
          })
          .then((description) => {
            if (!description) return;
            return connections[fromId].setLocalDescription(description);
          })
          .then(() => {
            if (socketRef.current) {
              socketRef.current.emit(
                "signal",
                fromId,
                JSON.stringify({ sdp: connections[fromId].localDescription })
              );
            }
          })
          .catch((e) => console.log(e));
      }
      if (signal.ice) {
        connections[fromId]
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch((e) => console.log(e));
      }
    }
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { sender: sender, data: data },
    ]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prevNewMessages) => prevNewMessages + 1);
    }
  };

  const connectToSocketServer = () => {
    if (!socketRef.current) {
      socketRef.current = io(server_url, { transports: ["websocket"] });
    }

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;
    //   socketRef.current.on("chat-message", (msg) => {
    //     setMessages((m) => [...m, msg]);
    //   });// 🧩 around line 280–285
// 🧩 around line 280–285
socketRef.current.on("chat-message", (msg) => {
  try {
    if (msg && msg.data && msg.data.sender && msg.data.data) {
      const { sender, data } = msg.data;
      setMessages((m) => [...m, { sender, data }]);
    } else {
      console.warn("Invalid message format:", msg);
    }
  } catch (err) {
    console.error("Error parsing chat-message:", err, msg);
  }
});




      socketRef.current.on("user-left", (id) => {
        setVideos((v) => v.filter((vv) => vv.socketId !== id));
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          connections[socketListId] = new RTCPeerConnection(
            peerConfigConnections
          );

          connections[socketListId].onicecandidate = (event) => {
            if (event.candidate != null && socketRef.current) {
              socketRef.current.emit(
                "signal",
                socketListId,
                JSON.stringify({ ice: event.candidate })
              );
            }
          };

          connections[socketListId].ontrack = (event) => {
            const [stream] = event.streams;
            setVideos((prev) => {
              const exists = prev.some((p) => p.socketId === socketListId);
              if (exists) {
                return prev.map((p) =>
                  p.socketId === socketListId ? { ...p, stream } : p
                );
              } else {
                return [
                  ...prev,
                  {
                    socketId: socketListId,
                    stream,
                    autoPlay: true,
                    playsInline: true,
                  },
                ];
              }
            });
          };

          // attach local stream if available
          if (window.localStream) {
            try {
              window.localStream
                .getTracks()
                .forEach((t) =>
                  connections[socketListId].addTrack(t, window.localStream)
                );
            } catch (e) {
              try {
                connections[socketListId].addStream(window.localStream);
              } catch (err) {}
            }
          } else {
            const blackSilence = (...args) =>
              new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            try {
              window.localStream
                .getTracks()
                .forEach((t) =>
                  connections[socketListId].addTrack(t, window.localStream)
                );
            } catch (e) {}
          }
        });

        // If joined user is self, create offers to all others
        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;
            try {
              window.localStream
                .getTracks()
                .forEach((t) =>
                  connections[id2].addTrack(t, window.localStream)
                );
            } catch (e) {
              try {
                connections[id2].addStream(window.localStream);
              } catch (err) {}
            }
            connections[id2]
              .createOffer()
              .then((description) =>
                connections[id2].setLocalDescription(description)
              )
              .then(() => {
                if (socketRef.current)
                  socketRef.current.emit(
                    "signal",
                    id2,
                    JSON.stringify({ sdp: connections[id2].localDescription })
                  );
              })
              .catch((e) => console.log(e));
          }
        }
      });
    });
  };

  /* ---------- helper stream utils ---------- */
  const silence = () => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  /* ---------------- UI handlers (moved to component scope) ---------------- */
  const handleVideo = () => {
    setVideo((v) => !v);
  };

  const handleAudio = () => {
    setAudio((a) => !a);
  };

  let getDislayMediaSuccess = (stream) => {
    console.log("HERE");
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    localVideoRef.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      connections[id].addStream(window.localStream);

      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription })
            );
          })
          .catch((e) => console.log(e));
      });
    }
    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setScreen(false);

          try {
            let tracks = localVideoRef.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoRef.current.srcObject = window.localStream;

          getUserMedia();
        })
    );
  };
  let getDislayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true })
          .then(getDislayMediaSuccess)
          .then((stream) => {})
          .catch((e) => console.log(e));
      }
    }
  };

  useEffect(() => {
    if (screen !== undefined) {
      getDislayMedia();
    }
  }, [screen]);
  let handleScreen = () => {
    setScreen(!screen);
  };

  let handleEndCall = () => {
    try {
      let tracks = localVideoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (e) {}
    window.location.href = "/home";
    //  routeTo()
  };

  const sendMessage = () => {
    if (!message.trim()) return;

    const newMsg = { sender: username || "You", data: message };

    // Emit to server
    if (socketRef.current) socketRef.current.emit("chat-message", newMsg);

    // Add to local messages so sender sees it instantly
    // setMessages((prev) => [...prev, newMsg]);

    setMessage("");
  };

  const getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
  };

  const connect = () => {
    setAskForUsername(false);
    getMedia();
    connectToSocketServer();
    if (!socketRef.current) {
      socketRef.current = io(server_url);
    }
  };
  let routeTo = useNavigate();

  /* ---------------- RENDER ---------------- */
  return (
    <div>
      {askForUsername ? (
        <div>
          <h2> Enter Into Lobby</h2>
          <TextField
            id="outlined-basic"
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
          />
          <Button variant="contained" onClick={connect}>
            Connect
          </Button>

          <div>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "320px", background: "#000" }}
            />
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal ? (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>

                <div className={styles.chattingDisplay}>
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div style={{ marginBottom: "20px" }} key={index}>
                        <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                        <p>{item.data}</p>
                      </div>
                    ))
                  ) : (
                    <p>No Messages Yet</p>
                  )}
                </div>

                <div className={styles.chattingArea}>
                  <TextField
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    id="outlined-basic"
                    label="Enter Your Chat"
                    variant="outlined"
                  />
                  <Button variant="contained" onClick={sendMessage}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <></>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>

            {screenAvailable && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}

            <Badge badgeContent={newMessages} max={999} color="secondary">
              <IconButton
                onClick={() => setModal(!showModal)}
                style={{ color: "white" }}
              >
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video
            className={styles.meetUserVideo}
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "320px", background: "#000" }}
          />
          <div className={styles.conferenceView}>
            {videos.map((v) => (
              <div key={v.socketId}>
                {/* <h2>{v.socketId}</h2> */}
                <video
                  data-socket={v.socketId}
                  ref={(ref) => {
                    if (ref && v.stream) ref.srcObject = v.stream;
                  }}
                  autoPlay
                  playsInline
                  style={{ width: "240px", background: "#000" }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
