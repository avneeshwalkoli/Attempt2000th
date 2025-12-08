import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SavedDevicesPanel from '../components/SavedDevicesPanel.jsx';
import ConnectDeviceCard from '../components/ConnectDeviceCard.jsx';
import AccessRequestModal from '../components/AccessRequestModal.jsx';
import IncomingRequestModal from '../components/IncomingRequestModal.jsx';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { desklinkApi } from '../services/desklink.api.js';
import { useDeskLinkSocket } from '../hooks/useDeskLinkSocket.js';
import SidebarShell from '../../chatspace/components/SidebarShell.jsx';
import {
  getNativeDeviceId,
  startRemoteClientSession,
  startRemoteHostSession,
} from '../utils/nativeBridge.js';

export default function DeskLinkPage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [localDeviceId, setLocalDeviceId] = useState('');
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [pendingSession, setPendingSession] = useState(null);
  const [showWaitingModal, setShowWaitingModal] = useState(false);

  const filteredContacts = useMemo(() => {
    const query = search.toLowerCase();
    return contacts.filter((contact) => {
      const name = (contact.aliasName || contact.contactUser.fullName).toLowerCase();
      return (
        name.includes(query) || contact.contactDeviceId.toLowerCase().includes(query)
      );
    });
  }, [contacts, search]);

  // Load native device id (from agent / bridge)
  useEffect(() => {
    const loadDeviceId = async () => {
      const id = await getNativeDeviceId();
      if (id) {
        setLocalDeviceId(id);
      }
    };
    loadDeviceId();
  }, []);

  // Load DeskLink contacts
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadContacts = async () => {
      try {
        const data = await desklinkApi.listContacts(token);
        if (!cancelled) setContacts(data.contacts || []);
      } catch (err) {
        console.error('Failed to load DeskLink contacts', err);
      }
    };
    loadContacts();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Handle remote response (from other side)
  const handleRemoteResponse = useCallback(
    (payload) => {
      if (!pendingSession || payload.sessionId !== pendingSession.sessionId) {
        return;
      }

      setShowWaitingModal(false);

      if (payload.status === 'accepted') {
        navigate(
          `/workspace/desklink/viewer?sessionId=${payload.sessionId}&remoteDeviceId=${payload.receiverDeviceId}`
        );
      } else if (payload.status === 'rejected') {
        window.alert('Remote user rejected the DeskLink request.');
      }

      if (payload.status === 'ended') {
        setPendingSession(null);
      }
    },
    [pendingSession, navigate]
  );

  // Handle incoming request event -> show modal
  const handleRemoteRequestEvent = useCallback((payload) => {
    setIncomingRequest({
      sessionId: payload.sessionId,
      fromUserId: payload.fromUserId,
      fromDeviceId: payload.fromDeviceId,
      callerName: payload.callerName,
    });
  }, []);

  // ✅ Initialize socket AFTER callbacks are defined
  const { socket } = useDeskLinkSocket({
    token,
    onRemoteRequest: handleRemoteRequestEvent,
    onRemoteResponse: handleRemoteResponse,
  });

  // ✅ Register this device on the socket, AFTER socket + localDeviceId exist
  useEffect(() => {
    if (!socket) return;
    if (!localDeviceId) return;

    console.log('[DeskLink] registering device on socket', localDeviceId);

    socket.emit('register', {
      deviceId: localDeviceId,
      platform: 'web',
      label: 'DeskLink Web',
      osInfo: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      deviceName: user?.fullName || 'Web Client',
    });
  }, [socket, localDeviceId, user]);

  const sendRemoteRequest = async (contact) => {
    if (!contact) {
      console.warn('[DeskLink] sendRemoteRequest called without contact');
      return;
    }

    const effectiveDeviceId =
      localDeviceId || localStorage.getItem('desklinkDeviceId') || '';

    const effectiveUser =
      user ||
      (() => {
        try {
          const raw = localStorage.getItem('vd_user_profile');
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      })();

    if (!effectiveDeviceId || !effectiveUser) {
      console.warn('[DeskLink] Missing device ID or user context; remote request skipped');
      console.log('[DeskLink] Debug - localDeviceId:', localDeviceId);
      console.log('[DeskLink] Debug - user from context:', user);
      console.log('[DeskLink] Debug - effectiveUser:', effectiveUser);
      return;
    }

    try {
      setShowWaitingModal(true);
      const { session } = await desklinkApi.requestRemote(token, {
        fromUserId: effectiveUser._id || effectiveUser.id,
        fromDeviceId: effectiveDeviceId,
        toUserId: contact.contactUser.id,
      });
      setPendingSession(session);
    } catch (err) {
      console.error('DeskLink request failed', err);
      setShowWaitingModal(false);
      window.alert(err.message || 'Unable to start remote session');
    }
  };

  const handleSelectContact = (contact) => {
    setSelectedContactId(contact.id);
    sendRemoteRequest(contact);
  };

  const handleManualRequest = async (deviceIdFromInput) => {
    const target = (deviceIdFromInput || '').trim();
    if (!target) {
      console.warn('[DeskLink] No target device ID provided');
      return;
    }

    const effectiveDeviceId =
      localDeviceId || localStorage.getItem('desklinkDeviceId') || '';

    let effectiveUser = user;
    if (!effectiveUser) {
      try {
        const raw = localStorage.getItem('vd_user_profile');
        effectiveUser = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('[DeskLink] Failed to parse user from localStorage', e);
        effectiveUser = null;
      }
    }

    console.log('[DeskLink] Debug - localDeviceId:', localDeviceId);
    console.log('[DeskLink] Debug - user from context:', user);
    console.log('[DeskLink] Debug - effectiveUser:', effectiveUser);
    console.log('[DeskLink] Debug - effectiveDeviceId:', effectiveDeviceId);
    console.log('[DeskLink] Debug - token:', token);

    if (!effectiveDeviceId) {
      console.warn('[DeskLink] Missing device ID for manual request; skipped');
      window.alert('Device ID not found. Please ensure the DeskLink Agent is running.');
      return;
    }

    if (!effectiveUser) {
      console.warn('[DeskLink] Missing user context for manual request; skipped');
      window.alert('User context not found. Please try logging in again.');
      return;
    }

    if (!token) {
      console.warn('[DeskLink] Missing auth token for manual request; skipped');
      window.alert('Authentication token not found. Please try logging in again.');
      return;
    }

    try {
      console.log('[DeskLink] Sending remote request to device:', target);
      setShowWaitingModal(true);
      const { session } = await desklinkApi.requestRemote(token, {
        fromUserId: effectiveUser._id || effectiveUser.id,
        fromDeviceId: effectiveDeviceId,
        toDeviceId: target,
      });
      console.log('[DeskLink] Remote request successful, session:', session);
      setPendingSession(session);
    } catch (err) {
      console.error('DeskLink manual request failed', err);
      setShowWaitingModal(false);
      window.alert(err.message || 'Unable to start remote session');
    }
  };

  const handleAcceptIncoming = async () => {
    if (!incomingRequest || !localDeviceId) return;
    try {
      await desklinkApi.acceptRemote(token, {
        sessionId: incomingRequest.sessionId,
        receiverDeviceId: localDeviceId,
      });
      startRemoteHostSession({
        sessionId: incomingRequest.sessionId,
        callerDeviceId: incomingRequest.fromDeviceId,
      });
      setIncomingRequest(null);
    } catch (err) {
      console.error('Failed to accept session', err);
      window.alert(err.message || 'Failed to accept request');
    }
  };

  const handleRejectIncoming = async () => {
    if (!incomingRequest) return;
    try {
      await desklinkApi.rejectRemote(token, {
        sessionId: incomingRequest.sessionId,
      });
    } catch (err) {
      console.error('Failed to reject session', err);
    } finally {
      setIncomingRequest(null);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-50 w-full">
      <SidebarShell />

      <main className="flex-1 flex items-stretch justify-center">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:py-10 flex flex-col lg:flex-row gap-6 lg:gap-8">
          <div className="w-full lg:max-w-sm">
            <SavedDevicesPanel
              contacts={filteredContacts}
              search={search}
              onSearchChange={setSearch}
              selectedId={selectedContactId}
              onSelectContact={handleSelectContact}
            />
          </div>

          <div className="flex-1 flex items-center justify-center">
            <ConnectDeviceCard
              initialDeviceId={
                contacts.find((c) => c.id === selectedContactId)?.contactDeviceId || ''
              }
              onRequestAccess={handleManualRequest}
            />
          </div>
        </div>

        {showWaitingModal && pendingSession && (
          <AccessRequestModal
            deviceId={pendingSession.receiverDeviceId}
            title="Request Sent"
            description="Waiting for the remote user to accept…"
            onClose={() => {
              setShowWaitingModal(false);
              setPendingSession(null);
            }}
          />
        )}

        {incomingRequest && (
          <IncomingRequestModal
            requesterName={incomingRequest.callerName}
            deviceLabel={incomingRequest.fromDeviceId}
            onAccept={handleAcceptIncoming}
            onReject={handleRejectIncoming}
          />
        )}
      </main>
    </div>
  );
}
