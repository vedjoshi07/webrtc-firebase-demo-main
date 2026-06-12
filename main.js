import './style.css';
import Peer from 'peerjs';

// ── State ─────────────────────────────────────────────────────────────────────
let myName = '';
let peer = null;
let localStream = null;
let currentCall = null;
let incomingCallObj = null;

// ── DOM Elements ──────────────────────────────────────────────────────────────
const screens = {
  login: document.getElementById('loginScreen'),
  contacts: document.getElementById('contactsScreen'),
  call: document.getElementById('callScreen')
};
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('usernameInput');

const dialInput = document.getElementById('dialInput');
const dialBtn = document.getElementById('dialBtn');
const myUsernameBadge = document.getElementById('myUsernameBadge');

const localVideo = document.getElementById('webcamVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localPlaceholder = document.getElementById('localPlaceholder');
const remotePlaceholder = document.getElementById('remotePlaceholder');

const incomingOverlay = document.getElementById('incomingCallOverlay');
const incomingCallerName = document.getElementById('incomingCallerName');
const acceptBtn = document.getElementById('acceptBtn');
const declineBtn = document.getElementById('declineBtn');

const callPeerName = document.getElementById('callPeerName');
const callTimer = document.getElementById('callTimer');
const hangupBtn = document.getElementById('hangupBtn');
const muteBtn = document.getElementById('muteBtn');
const videoToggleBtn = document.getElementById('videoToggleBtn');

// ── Utility: Switch Screens ───────────────────────────────────────────────────
function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
}

// ── 1. Login & Identity (Deterministic Peer ID) ───────────────────────────────
loginBtn.onclick = async () => {
  let name = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!name) return alert('Please enter a simple name (letters/numbers only)');
  
  myName = name;
  myUsernameBadge.textContent = myName;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Connecting...';

  // We use the exact name as the Peer ID. Prefixing to avoid random collisions globally.
  const deterministicId = 'video-app-' + myName;

  peer = new Peer(deterministicId);
  
  peer.on('open', (id) => {
    setupPeerListeners();
    showScreen('contacts');
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      alert('That name is already in use by someone else right now! Choose another.');
    } else {
      alert('Connection error: ' + err.message);
    }
    loginBtn.disabled = false;
    loginBtn.textContent = 'Join Network';
  });
};

// ── 2. Dialer (Instead of Contacts List) ──────────────────────────────────────
dialBtn.onclick = () => {
  const targetName = dialInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!targetName) return alert('Please enter the name of the person you want to call');
  if (targetName === myName) return alert('You cannot call yourself!');
  
  const targetPeerId = 'video-app-' + targetName;
  initiateCall(targetPeerId, targetName);
};

// ── 3. Media Stream Setup ─────────────────────────────────────────────────────
async function startWebcam() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localPlaceholder.style.display = 'none';
    return localStream;
  } catch (err) {
    alert('Camera/Microphone access required!');
    throw err;
  }
}

function stopWebcam() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    localVideo.srcObject = null;
    localPlaceholder.style.display = 'flex';
  }
}

// ── 4. Making a Call ──────────────────────────────────────────────────────────
async function initiateCall(remotePeerId, remoteName) {
  callPeerName.textContent = remoteName;
  callTimer.textContent = 'Calling...';
  remotePlaceholder.style.display = 'flex';
  remoteVideo.srcObject = null;
  showScreen('call');

  try {
    const stream = await startWebcam();
    const call = peer.call(remotePeerId, stream, {
      metadata: { callerName: myName }
    });
    manageActiveCall(call);
  } catch (err) {
    showScreen('contacts');
  }
}

// ── 5. Receiving a Call ───────────────────────────────────────────────────────
function setupPeerListeners() {
  peer.on('call', (call) => {
    if (currentCall) return;

    incomingCallObj = call;
    incomingCallerName.textContent = call.metadata?.callerName || 'Unknown';
    incomingOverlay.classList.remove('hidden');

    call.on('close', () => {
      incomingOverlay.classList.add('hidden');
      incomingCallObj = null;
    });
  });
}

acceptBtn.onclick = async () => {
  if (!incomingCallObj) return;
  incomingOverlay.classList.add('hidden');
  
  callPeerName.textContent = incomingCallObj.metadata?.callerName || 'Unknown';
  callTimer.textContent = 'Connecting...';
  showScreen('call');

  try {
    const stream = await startWebcam();
    incomingCallObj.answer(stream);
    manageActiveCall(incomingCallObj);
  } catch (err) {
    incomingCallObj.close();
    showScreen('contacts');
  }
};

declineBtn.onclick = () => {
  if (incomingCallObj) {
    incomingCallObj.close();
    incomingCallObj = null;
  }
  incomingOverlay.classList.add('hidden');
};

// ── 6. Active Call Management ─────────────────────────────────────────────────
function manageActiveCall(call) {
  currentCall = call;

  call.on('stream', (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
    remotePlaceholder.style.display = 'none';
    callTimer.textContent = 'Connected';
  });

  call.on('close', () => endCallUI());
  call.on('error', () => {
    alert('Call dropped or user is offline.');
    endCallUI();
  });
}

function endCallUI() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  stopWebcam();
  remoteVideo.srcObject = null;
  showScreen('contacts');
}

hangupBtn.onclick = endCallUI;

// ── 7. Floating Controls ──────────────────────────────────────────────────────
muteBtn.onclick = () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.classList.toggle('muted', !audioTrack.enabled);
  }
};

videoToggleBtn.onclick = () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    videoToggleBtn.classList.toggle('muted', !videoTrack.enabled);
    localPlaceholder.style.display = videoTrack.enabled ? 'none' : 'flex';
  }
};
