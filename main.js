import './style.css';
import Peer from 'peerjs';

// ── PeerJS setup ──────────────────────────────────────────────────────────────
let peer = null;
let localStream = null;
let currentCall = null;

// ── HTML elements ─────────────────────────────────────────────────────────────
const webcamButton      = document.getElementById('webcamButton');
const webcamVideo       = document.getElementById('webcamVideo');
const remoteVideo       = document.getElementById('remoteVideo');
const callButton        = document.getElementById('callButton');
const answerButton      = document.getElementById('answerButton');
const hangupButton      = document.getElementById('hangupButton');
const shareBox          = document.getElementById('shareBox');
const shareLinkInput    = document.getElementById('shareLinkInput');
const copyLinkBtn       = document.getElementById('copyLinkBtn');
const copyBtnText       = document.getElementById('copyBtnText');
const copyIcon          = document.getElementById('copyIcon');
const checkIcon         = document.getElementById('checkIcon');
const joinCallInput     = document.getElementById('joinCallInput');
const localPlaceholder  = document.getElementById('localPlaceholder');
const remotePlaceholder = document.getElementById('remotePlaceholder');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

// ── Auto-fill peer ID from URL ────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const peerIdFromUrl = urlParams.get('peer');
if (peerIdFromUrl) {
  joinCallInput.value = peerIdFromUrl;
  joinCallInput.classList.add('autofilled');
  document.getElementById('joinDesc').textContent =
    '✅ Peer ID detected — start your camera then click Answer!';
  step3.classList.add('active');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showRemoteStream(stream) {
  remoteVideo.srcObject = stream;
  remotePlaceholder.classList.add('hidden');
}

function initPeer() {
  return new Promise((resolve) => {
    const p = new Peer(); // Uses free PeerJS cloud signaling
    p.on('open', (id) => resolve({ peer: p, id }));
    p.on('error', (err) => alert('Connection error: ' + err.message));
  });
}

function setCallActive() {
  hangupButton.disabled = false;
  step2.classList.remove('active');
  step3.classList.remove('active');
}

// ── 1. Start webcam ───────────────────────────────────────────────────────────
webcamButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    webcamVideo.srcObject = localStream;
    localPlaceholder.classList.add('hidden');

    webcamButton.disabled = true;
    callButton.disabled = false;
    answerButton.disabled = false;

    step1.classList.add('done');
    step2.classList.remove('disabled');

    if (peerIdFromUrl) {
      step3.classList.add('active');
    } else {
      step2.classList.add('active');
    }
  } catch (err) {
    alert('Could not access camera/microphone: ' + err.message);
  }
};

// ── 2. Create a call (caller side) ───────────────────────────────────────────
callButton.onclick = async () => {
  callButton.disabled = true;
  callButton.innerHTML = `<span>Getting your ID…</span>`;

  const { peer: p, id } = await initPeer();
  peer = p;

  // Build shareable link
  const shareUrl = `${location.origin}${location.pathname}?peer=${id}`;
  shareLinkInput.value = shareUrl;
  shareBox.hidden = false;
  shareBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  callButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg> Link Ready — Waiting for answer…`;

  // Listen for incoming answer call
  peer.on('call', (call) => {
    currentCall = call;
    call.answer(localStream);
    call.on('stream', showRemoteStream);
    call.on('close', hangup);
    setCallActive();
  });
};

// ── 3. Answer a call (receiver side) ─────────────────────────────────────────
answerButton.onclick = async () => {
  const remotePeerId = joinCallInput.value.trim();
  if (!remotePeerId) {
    joinCallInput.focus();
    joinCallInput.placeholder = '⚠️ Paste the peer ID first';
    return;
  }

  answerButton.disabled = true;
  answerButton.innerHTML = `<span>Connecting…</span>`;

  const { peer: p } = await initPeer();
  peer = p;

  const call = peer.call(remotePeerId, localStream);
  currentCall = call;

  call.on('stream', showRemoteStream);
  call.on('close', hangup);
  call.on('error', (err) => {
    alert('Call failed: ' + err.message);
    answerButton.disabled = false;
    answerButton.textContent = 'Answer';
  });

  setCallActive();
};

// ── 4. Copy share link ────────────────────────────────────────────────────────
copyLinkBtn.onclick = async () => {
  const url = shareLinkInput.value;
  try {
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      await navigator.share({ title: 'Join my video call', url });
      return;
    }
    await navigator.clipboard.writeText(url);
  } catch {
    shareLinkInput.select();
    document.execCommand('copy');
  }

  copyIcon.style.display = 'none';
  checkIcon.style.display = '';
  copyBtnText.textContent = 'Copied!';
  copyLinkBtn.classList.add('copied');

  setTimeout(() => {
    copyIcon.style.display = '';
    checkIcon.style.display = 'none';
    copyBtnText.textContent = 'Copy';
    copyLinkBtn.classList.remove('copied');
  }, 2500);
};

// ── 5. Hangup ─────────────────────────────────────────────────────────────────
function hangup() {
  currentCall?.close();
  peer?.destroy();
  localStream?.getTracks().forEach((t) => t.stop());

  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;
  localPlaceholder.classList.remove('hidden');
  remotePlaceholder.classList.remove('hidden');

  webcamButton.disabled = false;
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;

  shareBox.hidden = true;
  joinCallInput.value = '';

  step1.classList.remove('done');
  step2.classList.add('disabled');
  step2.classList.remove('active');
  step3.classList.remove('active');

  callButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg> Create Call`;
  answerButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.45 2 2 0 0 1 3.59 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"></path>
    </svg> Answer`;

  history.replaceState({}, '', location.pathname);

  peer = null;
  currentCall = null;
  localStream = null;
}

hangupButton.onclick = hangup;
