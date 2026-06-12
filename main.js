import './style.css';
import Peer from 'peerjs';
import { db } from './firebase.js';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, deleteDoc } from 'firebase/firestore';

// ── State ─────────────────────────────────────────────────────────────────────
let myUid = Math.random().toString(36).substring(2, 10);
let myName = '';
let myPeerId = '';
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
const contactsList = document.getElementById('contactsList');
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

// ── 1. Login & Identity ───────────────────────────────────────────────────────
loginBtn.onclick = async () => {
  const name = usernameInput.value.trim();
  if (!name) return alert('Please enter a name');
  
  myName = name;
  myUsernameBadge.textContent = myName;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Connecting...';

  // Initialize PeerJS
  peer = new Peer();
  peer.on('open', async (id) => {
    myPeerId = id;
    
    // Register user in Firestore
    const userRef = doc(db, 'users', myUid);
    await setDoc(userRef, {
      name: myName,
      peerId: myPeerId,
      timestamp: serverTimestamp()
    });

    // Handle Window Close to remove user
    window.addEventListener('beforeunload', () => {
      deleteDoc(userRef);
      peer.destroy();
    });

    setupPeerListeners();
    listenForContacts();
    showScreen('contacts');
  });

  peer.on('error', (err) => {
    alert('PeerJS error: ' + err.message);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Join Network';
  });
};

// ── 2. Contacts List (Firestore) ──────────────────────────────────────────────
function listenForContacts() {
  const usersRef = collection(db, 'users');
  onSnapshot(usersRef, (snapshot) => {
    contactsList.innerHTML = '';
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      const uid = docSnap.id;
      
      if (uid === myUid) return; // Skip self

      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-info">
          <div class="contact-avatar">${user.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="contact-name">${user.name}</div>
            <div class="contact-status">Online</div>
          </div>
        </div>
        <button class="btn btn-success btn-call">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.45 2 2 0 0 1 3.59 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"></path>
          </svg>
        </button>
      `;

      item.querySelector('.btn-call').onclick = () => initiateCall(user.peerId, user.name);
      contactsList.appendChild(item);
    });

    if (contactsList.children.length === 0) {
      contactsList.innerHTML = '<p class="text-muted" style="padding:1rem;">No one else is online right now. Open another tab to test!</p>';
    }
  });
}

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
    // If already in a call, reject automatically (or ignore)
    if (currentCall) return;

    incomingCallObj = call;
    incomingCallerName.textContent = call.metadata?.callerName || 'Unknown';
    incomingOverlay.classList.remove('hidden');

    // If caller hangs up before we answer
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

  call.on('close', () => {
    endCallUI();
  });

  call.on('error', () => {
    alert('Call dropped');
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
