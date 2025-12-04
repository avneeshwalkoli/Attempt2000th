import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SavedDevicesPanel from '../components/SavedDevicesPanel.jsx';
import ConnectDeviceCard from '../components/ConnectDeviceCard.jsx';
import AccessRequestModal from '../components/AccessRequestModal.jsx';
import IncomingRequestModal from '../components/IncomingRequestModal.jsx';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { desklinkApi } from '../services/desklink.api.js';
import { useDeskLinkSocket } from '../hooks/useDeskLinkSocket.js';
import {
  getNativeDeviceId,
  startRemoteClientSession,
  startRemoteHostSession,
} from '../utils/nativeBridge.js';

export default function DeskLinkPage() {
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

  useEffect(() => {
    const loadDeviceId = async () => {
      const id = await getNativeDeviceId();
      if (id) {
        setLocalDeviceId(id);
      }
    };
    loadDeviceId();
  }, []);

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

  const handleRemoteResponse = useCallback(
    (payload) => {
      if (!pendingSession || payload.sessionId !== pendingSession.sessionId) {
        return;
      }
      setShowWaitingModal(false);

      if (payload.status === 'accepted') {
        startRemoteClientSession({
          sessionId: payload.sessionId,
          receiverDeviceId: payload.receiverDeviceId,
        });
      } else if (payload.status === 'rejected') {
        window.alert('Remote user rejected the DeskLink request.');
      }

      if (payload.status === 'ended') {
        setPendingSession(null);
      }
    },
    [pendingSession]
  );

  const handleRemoteRequestEvent = useCallback((payload) => {
    setIncomingRequest({
      sessionId: payload.sessionId,
      fromUserId: payload.fromUserId,
      fromDeviceId: payload.fromDeviceId,
      callerName: payload.callerName,
    });
  }, []);

  useDeskLinkSocket({
    token,
    onRemoteRequest: handleRemoteRequestEvent,
    onRemoteResponse: handleRemoteResponse,
  });

  const sendRemoteRequest = async (contact) => {
    if (!contact || !localDeviceId || !user) {
      window.alert('Missing device ID or user context.');
      return;
    }

    try {
      setShowWaitingModal(true);
      const { session } = await desklinkApi.requestRemote(token, {
        fromUserId: user._id || user.id,
        fromDeviceId: localDeviceId,
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

  const handleManualRequest = (deviceIdFromInput) => {
    const target = (deviceIdFromInput || '').trim();
    if (!target) return;
    const match = contacts.find(
      (c) => c.contactDeviceId.toLowerCase() === target.toLowerCase()
    );
    if (match) {
      handleSelectContact(match);
    } else {
      window.alert('Unknown DeskLink ID. Save the contact first.');
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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-stretch justify-center">
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
    </div>
  );
}

