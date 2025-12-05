using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using SocketIOClient;
using DeskLinkAgent.IPC;
using DeskLinkAgent.WebRTC;

namespace DeskLinkAgent.Networking;

public class SocketClient : IAsyncDisposable
{
    private readonly string _deviceId;
    private readonly AgentIpcServer _ipc;
    private SocketIOClient.SocketIO? _client;
    private WebRTCLauncher? _webrtcLauncher;

    public SocketClient(string deviceId, AgentIpcServer ipc)
    {
        _deviceId = deviceId;
        _ipc = ipc;
    }

    public async Task ConnectAsync(string serverUrl)
    {
        Console.WriteLine($"[Socket] ConnectAsync => serverUrl={serverUrl}");

        var agentSecret = Environment.GetEnvironmentVariable("AGENT_SECRET") ?? "dev-secret";

        // Use fully-qualified type to avoid namespace/type ambiguity
        _client = new SocketIOClient.SocketIO(serverUrl, new SocketIOOptions
        {
            Reconnection = true,
            ReconnectionAttempts = int.MaxValue,
            ReconnectionDelay = 2000,
            // Auth must be a dictionary for this client version
            Auth = new Dictionary<string, object>
            {
                { "agent", "desklink-agent" },
                { "secret", agentSecret }
            }
        });

        // Connected handler
        _client.OnConnected += async (_, __) =>
        {
            Console.WriteLine("[Socket] connected ✓");

            // Register device so server maps deviceId -> socketId
            await Emit("register", new { deviceId = _deviceId });

            // Backward compatibility events
            await Emit("agent-auth", new { deviceId = _deviceId });
            await Emit("agent-status", new { status = "online", deviceId = _deviceId });

            Console.WriteLine("[Socket] register + auth emitted ✓");
        };

        // Disconnected handler
        _client.OnDisconnected += (_, reason) =>
        {
            Console.WriteLine("[Socket] disconnected => " + reason);
        };

        // Server -> Agent events
        _client.On("remote-request", response =>
        {
            Console.WriteLine("[Socket] remote-request received");
            try { _ipc.NotifyIncomingRemoteRequest(); } catch (Exception e) { Console.Error.WriteLine("[IPC] NotifyIncomingRemoteRequest error: " + e); }
        });

        _client.On("remote-accept", response =>
        {
            Console.WriteLine("[Socket] remote-accept received");
            try { _ipc.NotifyRemoteSessionAccepted(); } catch (Exception e) { Console.Error.WriteLine("[IPC] NotifyRemoteSessionAccepted error: " + e); }
        });

        _client.On("remote-reject", response =>
        {
            Console.WriteLine("[Socket] remote-reject received");
        });

        _client.On("remote-end", response =>
        {
            Console.WriteLine("[Socket] remote-end received");
            try { _ipc.NotifyRemoteSessionEnded(); } catch (Exception e) { Console.Error.WriteLine("[IPC] NotifyRemoteSessionEnded error: " + e); }
            StopWebRTC();
        });

        // WebRTC signaling events
        _client.On("desklink-session-start", response =>
        {
            try
            {
                var json = response.GetValue<JsonElement>();
                var sessionId = json.GetProperty("sessionId").GetString();
                var token = json.GetProperty("token").GetString();
                var role = json.GetProperty("role").GetString();
                var callerDeviceId = json.GetProperty("callerDeviceId").GetString();
                var receiverDeviceId = json.GetProperty("receiverDeviceId").GetString();

                Console.WriteLine($"[Socket] desklink-session-start => session={sessionId}, role={role}");

                // Start WebRTC helper (null-forgiving since we validated above)
                StartWebRTC(sessionId!, token!, role!, callerDeviceId!, receiverDeviceId!, serverUrl);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Socket] error parsing desklink-session-start: " + ex);
            }
        });

        _client.On("desklink-session-ended", _ =>
        {
            Console.WriteLine("[Socket] desklink-session-ended");
            StopWebRTC();
        });

        _client.On("webrtc-cancel", _ =>
        {
            Console.WriteLine("[Socket] webrtc-cancel received");
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
            Console.Error.WriteLine($"[Socket] emit error ({eventName}): {ex.Message}");
        }
    }

    private void StartWebRTC(string sessionId, string token, string role, string callerDeviceId, string receiverDeviceId, string serverUrl)
    {
        try
        {
            StopWebRTC();

            var remoteDeviceId = role == "receiver" ? callerDeviceId : receiverDeviceId;

            _webrtcLauncher = new WebRTCLauncher(
                sessionId,
                token,
                _deviceId,
                "agent-user-id", // TODO: replace with real user id
                remoteDeviceId,
                role,
                serverUrl
            );

            _webrtcLauncher.Start();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Socket] Failed to start WebRTC: " + ex);
        }
    }

    private void StopWebRTC()
    {
        try
        {
            _webrtcLauncher?.Dispose();
            _webrtcLauncher = null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Socket] StopWebRTC error: " + ex);
        }
    }

    public ValueTask DisposeAsync()
    {
        try
        {
            StopWebRTC();
            _client?.Dispose();
        }
        catch { }

        return ValueTask.CompletedTask;
    }
}
