using SocketIOClient;
using System.Text.Json;
using DeskLinkAgent.IPC;
using DeskLinkAgent.WebRTC;

namespace DeskLinkAgent.Networking;

public class SocketClient : IAsyncDisposable
{
    private readonly string _deviceId;
    private readonly AgentIpcServer _ipc;
    private SocketIO? _client;
    private WebRTCLauncher? _webrtcLauncher;

    public SocketClient(string deviceId, AgentIpcServer ipc)
    {
        _deviceId = deviceId;
        _ipc = ipc;
    }

    public async Task ConnectAsync(string serverUrl)
    {
        _client ??= new SocketIO(serverUrl, new SocketIOOptions
        {
            Eio = 4,
            Transport = SocketIOClient.Transport.TransportProtocol.WebSocket,
            Reconnection = true,
            ReconnectionDelay = 2000,
            ReconnectionAttempts = int.MaxValue
        });

        _client.OnConnected += async (sender, e) =>
        {
            Console.WriteLine("[Socket] connected");
            await Emit("agent-auth", new { deviceId = _deviceId });
            await Emit("agent-status", new { status = "online", deviceId = _deviceId });
        };

        _client.OnDisconnected += (sender, e) =>
        {
            Console.WriteLine("[Socket] disconnected");
        };

        // Server -> Agent events
        _client.On("remote-request", response =>
        {
            Console.WriteLine("[Socket] remote-request received");
            _ipc.NotifyIncomingRemoteRequest();
        });

        _client.On("remote-accept", response =>
        {
            Console.WriteLine("[Socket] remote-accept received");
            _ipc.NotifyRemoteSessionAccepted();
        });

        _client.On("remote-reject", response =>
        {
            Console.WriteLine("[Socket] remote-reject received");
        });

        _client.On("remote-end", response =>
        {
            Console.WriteLine("[Socket] remote-end received");
            _ipc.NotifyRemoteSessionEnded();
            StopWebRTC();
        });

        // WebRTC signaling events
        _client.On("desklink-session-start", response =>
        {
            try
            {
                var data = response.GetValue<JsonElement>();
                var sessionId = data.GetProperty("sessionId").GetString();
                var token = data.GetProperty("token").GetString();
                var role = data.GetProperty("role").GetString();
                var callerDeviceId = data.GetProperty("callerDeviceId").GetString();
                var receiverDeviceId = data.GetProperty("receiverDeviceId").GetString();
                
                Console.WriteLine($"[Socket] Session start: {sessionId}, role: {role}");
                
                // Start WebRTC helper
                StartWebRTC(sessionId, token, role, callerDeviceId, receiverDeviceId, serverUrl);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Socket] Error handling session start: {ex.Message}");
            }
        });

        _client.On("desklink-session-ended", response =>
        {
            Console.WriteLine("[Socket] Session ended");
            StopWebRTC();
        });

        _client.On("webrtc-cancel", response =>
        {
            Console.WriteLine("[Socket] WebRTC cancelled");
            StopWebRTC();
        });

        await _client.ConnectAsync();
    }

    public async Task Emit(string eventName, object payload)
    {
        try
        {
            if (_client == null) return;
            await _client.EmitAsync(eventName, payload);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Socket] emit error {eventName}: {ex.Message}");
        }
    }

    private void StartWebRTC(string sessionId, string token, string role, string callerDeviceId, string receiverDeviceId, string serverUrl)
    {
        try
        {
            StopWebRTC(); // Stop any existing session
            
            var remoteDeviceId = role == "receiver" ? callerDeviceId : receiverDeviceId;
            
            _webrtcLauncher = new WebRTCLauncher(
                sessionId,
                token,
                _deviceId,
                "agent-user-id", // TODO: Get actual user ID
                remoteDeviceId,
                role,
                serverUrl
            );
            
            _webrtcLauncher.Start();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Socket] Failed to start WebRTC: {ex.Message}");
        }
    }

    private void StopWebRTC()
    {
        if (_webrtcLauncher != null)
        {
            _webrtcLauncher.Dispose();
            _webrtcLauncher = null;
        }
    }

    public ValueTask DisposeAsync()
    {
        try
        {
            StopWebRTC();
            return _client != null ? _client.DisposeAsync() : ValueTask.CompletedTask;
        }
        catch
        {
            return ValueTask.CompletedTask;
        }
    }
}
