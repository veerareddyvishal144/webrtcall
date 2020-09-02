import React, { useRef, useEffect,useState } from "react";
import io from "socket.io-client";
import streamSaver from "streamsaver";

const Room = (props) => {
    const [file, setFile] = useState();
    const [gotFile, setGotFile] = useState(false);
    const chunksRef = useRef([]);
    const [connectionEstablished, setConnection] = useState(false);

    const userVideo = useRef();
    const partnerVideo = useRef();
    const peerRef = useRef();
    const socketRef = useRef();
    const otherUser = useRef();
    const userStream = useRef();
    const senders = useRef([]);
    const fileNameRef = useRef("");
    const sendChannel = useRef();
    const worker = new Worker("../worker.js");

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(stream => {
            userVideo.current.srcObject = stream;
            userStream.current = stream;

            socketRef.current = io.connect("/");
            socketRef.current.emit("join room", props.match.params.roomID);

            socketRef.current.on('other user', userID => {
                callUser(userID);
                otherUser.current = userID;
            });

            socketRef.current.on("user joined", userID => {
                otherUser.current = userID;
            });

            socketRef.current.on("offer", handleRecieveCall);

            socketRef.current.on("answer", handleAnswer);

            socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
        });

    }, []);

    function callUser(userID) {
        peerRef.current = createPeer(userID);
      sendChannel.current= peerRef.current.createDataChannel("sendChannel");
      sendChannel.current.onmessage = handleReceivingData;
        userStream.current.getTracks().forEach(track => senders.current.push(peerRef.current.addTrack(track, userStream.current)));
    }

    function createPeer(userID) {
        const peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.stunprotocol.org"
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com'
                },
            ]
        });

        peer.onicecandidate = handleICECandidateEvent;
        peer.ontrack = handleTrackEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);
       
        return peer;
    }

    function handleNegotiationNeededEvent(userID) {
        peerRef.current.createOffer().then(offer => {
            return peerRef.current.setLocalDescription(offer);
        }).then(() => {
            const payload = {
                target: userID,
                caller: socketRef.current.id,
                sdp: peerRef.current.localDescription
            };
            socketRef.current.emit("offer", payload);
        }).catch(e => console.log(e));
    }

    function handleRecieveCall(incoming) {
        peerRef.current = createPeer();
        peerRef.current.ondatachannel = (e)=>{
            sendChannel.current = e.channel;
            sendChannel.current.onmessage = handleReceivingData;
        }
        const desc = new RTCSessionDescription(incoming.sdp);
        peerRef.current.setRemoteDescription(desc).then(() => {
            userStream.current.getTracks().forEach(track => peerRef.current.addTrack(track, userStream.current));
        }).then(() => {
            return peerRef.current.createAnswer();
        }).then(answer => {
            return peerRef.current.setLocalDescription(answer);
        }).then(() => {
            const payload = {
                target: incoming.caller,
                caller: socketRef.current.id,
                sdp: peerRef.current.localDescription
            }
            setConnection(true);
            socketRef.current.emit("answer", payload);
        })
    }

    function handleAnswer(message) {
        const desc = new RTCSessionDescription(message.sdp);
        peerRef.current.setRemoteDescription(desc).catch(e => console.log(e));
    }

    function handleICECandidateEvent(e) {
        if (e.candidate) {
            const payload = {
                target: otherUser.current,
                candidate: e.candidate,
            }
            socketRef.current.emit("ice-candidate", payload);
        }
    }

    function handleNewICECandidateMsg(incoming) {
        const candidate = new RTCIceCandidate(incoming);

        peerRef.current.addIceCandidate(candidate)
            .catch(e => console.log(e));
    }

    function handleTrackEvent(e) {
        partnerVideo.current.srcObject = e.streams[0];
    };

    function shareScreen() {
        navigator.mediaDevices.getDisplayMedia({ cursor: true }).then(stream => {
            const screenTrack = stream.getTracks()[0];
            senders.current.find(sender => sender.track.kind === 'video').replaceTrack(screenTrack);
            screenTrack.onended = function() {
                senders.current.find(sender => sender.track.kind === "video").replaceTrack(userStream.current.getTracks()[1]);
            }
        })
    }
    function handleReceivingData(data) {
        var start= false;
       if(typeof(data["data"]) === "string"){
           start = true;
        var filecomplete = JSON.parse(data["data"]);
        console.log(filecomplete);
       }
       
       
        if (start) {
            setGotFile(true);
           
            fileNameRef.current = filecomplete.fileName;
        } else {
            worker.postMessage(data["data"]);
        }
    }

    function download() {
        /**Issue is here  */
        setGotFile(false);
        worker.postMessage("download");
        worker.addEventListener("message", event => {
            const stream = event.data.stream();
            const fileStream = streamSaver.createWriteStream(fileNameRef.current);
            stream.pipeTo(fileStream);
        })
    }

    function selectFile(e) {
        setFile(e.target.files[0]);
    }

    function sendFile() {
       
        const stream = file.stream();
        const reader = stream.getReader();

        reader.read().then(obj => {
            handlereading(obj.done, obj.value);
        });

        function handlereading(done, value) {
            if (done) {
            
               sendChannel.current.send(JSON.stringify({ done: true, fileName: file.name }));
                return;
            }

            sendChannel.current.send(value);
            reader.read().then(obj => {
                handlereading(obj.done, obj.value);
            })
        }

    }
    let body;

        body = (
            <div>
                <input onChange={selectFile} type="file" />
                <button onClick={sendFile}>Send file</button>
            </div>
        );
  


    let downloadPrompt;
    if (gotFile) {
        downloadPrompt = (
            <div>
                <span>You have received a file. Would you like to download the file?</span>
                <button onClick={download}>Yes</button>
            </div>
        );
    }

    return (
       <div>
  <video controls style={{height: 500, width: 500}} muted autoPlay ref={userVideo} />
            <video controls style={{height: 500, width: 500}} muted autoPlay ref={partnerVideo} />
            <button onClick={shareScreen}>Share screen</button>
            {body}
            {downloadPrompt}

        </div>
       
    );
};

export default Room;
